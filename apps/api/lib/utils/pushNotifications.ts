import { COLLECTIONS, getCollection } from "@ckd/core/server";
import type { TWeeklyNutritionInsight } from "@ckd/core";
import type { Db } from "mongodb";

type UserPiiPushDoc = {
  devices?: Array<{
    lastSeenAt?: Date;
    platform?: "android" | "ios" | "web";
    pushToken?: string;
  }>;
  notificationPrefs?: {
    push?: boolean;
  };
  patientId: string;
};

type ExpoPushTicket = {
  details?: {
    error?: string;
  };
  message?: string;
  status?: "error" | "ok";
};

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";

function getInsightPreview(insight: TWeeklyNutritionInsight) {
  const firstSentence = insight.humanMessage.split(/(?<=[.!?])\s+/)[0]?.trim();
  return firstSentence || "Your weekly nutrition report is ready.";
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

  const pushMessages = insights.flatMap((insight) => {
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
      sound: "default",
      title: "Weekly report ready",
      to,
    }));
  });

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
