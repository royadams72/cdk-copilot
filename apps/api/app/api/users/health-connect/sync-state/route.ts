export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { ROLES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

type SyncRecordType =
  | "steps"
  | "heart_rate"
  | "sleep"
  | "exercise"
  | "blood_pressure";

type SyncStateDoc = {
  _id?: ObjectId;
  createdAt: Date;
  orgId?: string;
  patientId: ObjectId;
  provider: "health_connect";
  recordTypes?: Partial<Record<SyncRecordType, { lastSyncedAt: Date }>>;
  updatedAt: Date;
};

const ALLOWED_RECORD_TYPES: SyncRecordType[] = [
  "steps",
  "heart_rate",
  "sleep",
  "exercise",
  "blood_pressure",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseSyncRecordTypes(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const parsed: Partial<Record<SyncRecordType, { lastSyncedAt: Date }>> = {};

  for (const recordType of ALLOWED_RECORD_TYPES) {
    const entry = value[recordType];
    if (!isRecord(entry)) {
      continue;
    }

    const lastSyncedAtValue = entry.lastSyncedAt;
    if (typeof lastSyncedAtValue !== "string") {
      return null;
    }
    const lastSyncedAt = new Date(lastSyncedAtValue);
    if (Number.isNaN(lastSyncedAt.getTime())) {
      return null;
    }

    parsed[recordType] = { lastSyncedAt };
  }

  return parsed;
}

function toResponse(doc: SyncStateDoc | null) {
  return {
    provider: "health_connect" as const,
    recordTypes: Object.fromEntries(
      Object.entries(doc?.recordTypes ?? {}).map(([recordType, entry]) => [
        recordType,
        {
          lastSyncedAt: entry.lastSyncedAt.toISOString(),
        },
      ]),
    ),
    updatedAt: doc?.updatedAt ? doc.updatedAt.toISOString() : null,
  };
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

    const db = await getDb();
    const patientId = new ObjectId(caller.patientId);
    const syncState = await db
      .collection<SyncStateDoc>(COLLECTIONS.HealthConnectSyncState)
      .findOne({
        patientId,
        provider: "health_connect",
      });

    return ok(toResponse(syncState));
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const recordTypes = parseSyncRecordTypes(body.recordTypes);
    if (!recordTypes || Object.keys(recordTypes).length === 0) {
      return bad("recordTypes.lastSyncedAt is required", undefined, 400);
    }

    const now = new Date();
    const patientId = new ObjectId(caller.patientId);
    const setFields: Record<string, unknown> = {
      updatedAt: now,
    };

    for (const [recordType, entry] of Object.entries(recordTypes)) {
      setFields[`recordTypes.${recordType}.lastSyncedAt`] = entry.lastSyncedAt;
    }

    const db = await getDb();
    await db.collection<SyncStateDoc>(COLLECTIONS.HealthConnectSyncState).updateOne(
      {
        patientId,
        provider: "health_connect",
      },
      {
        $set: setFields,
        $setOnInsert: {
          createdAt: now,
          orgId: caller.orgId,
          patientId,
          provider: "health_connect",
        },
      },
      { upsert: true },
    );

    const syncState = await db
      .collection<SyncStateDoc>(COLLECTIONS.HealthConnectSyncState)
      .findOne({
        patientId,
        provider: "health_connect",
      });

    return ok(toResponse(syncState));
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
