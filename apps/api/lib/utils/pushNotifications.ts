import { COLLECTIONS, getCollection } from "@ckd/core/server";
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

async function sendExpoPushMessages(pushMessages: ExpoPushMessage[]) {
  if (!pushMessages.length) {
    return { attempted: 0, delivered: 0, failed: 0, tickets: [] as ExpoPushTicket[] };
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
    tickets,
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

  const ticketErrors = result.tickets.filter((ticket) => ticket.status !== "ok");
  if (ticketErrors.length) {
    console.error("[push:send] patient notification failed", {
      matchedPatientId: user?.patientId ?? null,
      principalId: user?.principalId ?? null,
      ticketErrors: ticketErrors.map((ticket) => ({
        details: ticket.details ?? null,
        message: ticket.message ?? null,
        status: ticket.status ?? null,
      })),
      tokenCount: tokens.length,
    });
  }

  return result;
}
