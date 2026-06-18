import { COLLECTIONS, getCollection } from "@ckd/core/server";
import type { TWeeklyNutritionInsight } from "@ckd/core";
import { ObjectId, type Db } from "mongodb";

type UserPiiPushDoc = {
  devices?: Array<{
    lastSeenAt?: Date;
    platform?: "android" | "ios" | "web";
    pushToken?: string;
  }>;
  notificationPrefs?: {
    push?: boolean;
  };
  patientId?: ObjectId | string;
  principalId?: string;
};

type ExpoPushTicket = {
  details?: {
    error?: string;
  };
  message?: string;
  status?: "error" | "ok";
};

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";

type ExpoPushMessage = {
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
  title: string;
  to: string;
};

function getInsightPreview(insight: TWeeklyNutritionInsight) {
  const firstSentence = insight.humanMessage.split(/(?<=[.!?])\s+/)[0]?.trim();
  return firstSentence || "Your weekly nutrition report is ready.";
}

async function sendExpoPushMessages(pushMessages: ExpoPushMessage[]) {
  if (!pushMessages.length) {
    return { attempted: 0, delivered: 0, failed: 0 };
  }

  const response = await fetch(EXPO_PUSH_API_URL, {
    body: JSON.stringify(pushMessages),
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw Object.assign(
      new Error(`Expo push send failed with ${response.status}${body ? `: ${body}` : ""}`),
      { status: response.status },
    );
  }

  const result =
    (await response.json().catch(() => null)) as
      | { data?: ExpoPushTicket[] }
      | null;
  const tickets = result?.data ?? [];
  const delivered = tickets.filter((ticket) => ticket.status === "ok").length;

  return {
    attempted: pushMessages.length,
    delivered,
    failed: pushMessages.length - delivered,
  };
}

export async function sendPatientPushNotification(
  db: Db,
  input: {
    body: string;
    data?: Record<string, unknown>;
    patientId: string;
    title: string;
  },
) {
  const usersPii = getCollection<UserPiiPushDoc>(db, COLLECTIONS.UsersPII);
  const patientObjectId = ObjectId.isValid(input.patientId)
    ? new ObjectId(input.patientId)
    : null;
  const patientFilter = {
    ...(patientObjectId
      ? {
          $or: [
            { patientId: patientObjectId },
            { patientId: input.patientId },
          ],
        }
      : { patientId: input.patientId }),
    "notificationPrefs.push": true,
    "devices.pushToken": { $exists: true },
  } as const;
  const user = await usersPii.findOne(
    patientFilter,
    {
      projection: {
        devices: 1,
        notificationPrefs: 1,
        principalId: 1,
        patientId: 1,
      },
    },
  );

  const tokens = Array.from(
    new Set(
      (user?.devices ?? [])
        .map((device) => device.pushToken?.trim())
        .filter((token): token is string => Boolean(token)),
    ),
  );

  const result = await sendExpoPushMessages(
    tokens.map((to) => ({
      body: input.body,
      data: input.data,
      sound: "default" as const,
      title: input.title,
      to,
    })),
  );

  console.log("[push:send] patient notification result", {
    filter: patientFilter,
    matchedPatientId: user?.patientId ?? null,
    principalId: user?.principalId ?? null,
    result,
    tokenCount: tokens.length,
  });

  return result;
}

export async function sendWeeklyInsightPushNotifications(
  db: Db,
  insights: TWeeklyNutritionInsight[],
) {
  if (!insights.length) {
    return { attempted: 0, delivered: 0, failed: 0 };
  }

  const usersPii = getCollection<UserPiiPushDoc>(db, COLLECTIONS.UsersPII);
  const patientIds = insights.map((insight) => insight.patientId);
  const users = await usersPii
    .find(
      {
        patientId: { $in: patientIds },
        "notificationPrefs.push": true,
        "devices.pushToken": { $exists: true },
      },
      {
        projection: {
          devices: 1,
          notificationPrefs: 1,
          patientId: 1,
        },
      },
    )
    .toArray();

  const pushMessages: ExpoPushMessage[] = insights.flatMap((insight) => {
    const user = users.find((candidate) => candidate.patientId === insight.patientId);
    const tokens = (user?.devices ?? [])
      .map((device) => device.pushToken?.trim())
      .filter((token): token is string => Boolean(token));

    return Array.from(new Set(tokens)).map((to) => ({
      body: getInsightPreview(insight),
      data: {
        screen: "/(nutrition)/nutrition-details",
        type: "weekly-report",
        weekEnd: insight.weekEnd,
        weekStart: insight.weekStart,
      },
      sound: "default" as const,
      title: "Weekly report ready",
      to,
    }));
  });

  return sendExpoPushMessages(pushMessages);
}
