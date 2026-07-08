export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import {
  type HealthSyncProvider,
  parseHealthSyncProvider,
} from "@/apps/api/lib/healthSync/provider";
import { bad, badFromError, ok } from "@/apps/api/lib/http/responses";
import { ROLES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

type EventInput = {
  clientAt?: string;
  deviceId?: string;
  event: string;
  payload?: Record<string, unknown>;
  platform: "android" | "ios";
  provider?: HealthSyncProvider;
  source: string;
  status?: "error" | "info" | "warn";
  trigger?: string;
};

function asTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function asDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function asPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }

    const body = (await req.json().catch(() => ({}))) as {
      events?: EventInput[];
      provider?: HealthSyncProvider;
    };
    const events = Array.isArray(body.events) ? body.events : [];
    const requestProvider = parseHealthSyncProvider(body.provider);
    // console.log("[health-connect-event-log] POST received", {
    //   eventCount: events.length,
    //   orgId: caller.orgId ?? "org_demo",
    //   patientId: caller.patientId,
    //   role: caller.role,
    // });
    if (!events.length) {
      // console.warn("[health-connect-event-log] POST rejected: no events supplied");
      return bad("events is required", undefined, 400);
    }

    const patientId = new ObjectId(caller.patientId);
    const now = new Date();
    const docs = events
      .map((event) => {
        const eventName = asTrimmedString(event.event);
        const source = asTrimmedString(event.source);
        const platform =
          event.platform === "android" || event.platform === "ios"
            ? event.platform
            : null;
        if (!eventName || !source || !platform) {
          return null;
        }

        const doc: Record<string, unknown> = {
          at: now,
          env: process.env.NODE_ENV || "dev",
          event: eventName,
          orgId: caller.orgId ?? "org_demo",
          patientId,
          platform,
          provider: parseHealthSyncProvider(event.provider, requestProvider),
          source,
          status:
            event.status === "error" ||
            event.status === "warn" ||
            event.status === "info"
              ? event.status
              : "info",
        };

        const clientAt = asDate(event.clientAt);
        const deviceId = asTrimmedString(event.deviceId);
        const payload = asPayload(event.payload);
        const trigger = asTrimmedString(event.trigger);

        if (clientAt) {
          doc.clientAt = clientAt;
        }
        if (deviceId) {
          doc.deviceId = deviceId;
        }
        if (payload) {
          doc.payload = payload;
        }
        if (trigger) {
          doc.trigger = trigger;
        }

        return doc;
      })
      .filter((doc): doc is NonNullable<typeof doc> => doc !== null);

    if (!docs.length) {
      return bad("No valid events supplied", undefined, 400);
    }

    const db = await getDb();

    await db.collection(COLLECTIONS.HealthConnectEventLogs).insertMany(docs, {
      ordered: false,
    });

    return ok({ inserted: docs.length });
  } catch (err: any) {
    // console.error("[health-connect-event-log] POST failed", {
    //   message: err?.message || "Server error",
    //   status: err?.status || 500,
    //   stack: err?.stack,
    // });
    return badFromError(err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }

    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "100");
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(500, Math.round(limitRaw)))
      : 100;

    const db = await getDb();
    const logs = await db
      .collection(COLLECTIONS.HealthConnectEventLogs)
      .find(
        { patientId: new ObjectId(caller.patientId) },
        {
          projection: {
            _id: 0,
            at: 1,
            clientAt: 1,
            deviceId: 1,
            event: 1,
            payload: 1,
            platform: 1,
            provider: 1,
            source: 1,
            status: 1,
            trigger: 1,
          },
        },
      )
      .sort({ at: -1 })
      .limit(limit)
      .toArray();

    return ok({ items: logs });
  } catch (err: any) {
    return badFromError(err);
  }
}
