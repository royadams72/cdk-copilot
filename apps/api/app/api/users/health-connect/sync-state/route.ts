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

type StepsSyncEntry = {
  lastSyncedAt?: Date;
  backfilledFrom?: Date;
};

type GenericSyncEntry = {
  lastSyncedAt: Date;
};

type SyncStateDoc = {
  _id?: ObjectId;
  createdAt: Date;
  orgId?: string;
  patientId: ObjectId;
  provider: "health_connect";
  recordTypes?: {
    steps?: StepsSyncEntry;
    heart_rate?: GenericSyncEntry;
    sleep?: GenericSyncEntry;
    exercise?: GenericSyncEntry;
    blood_pressure?: GenericSyncEntry;
  };
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

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

type ParsedEntry =
  | { type: "steps"; lastSyncedAt?: Date; backfilledFrom?: Date }
  | { type: "generic"; lastSyncedAt: Date };

function parseSyncRecordTypes(value: unknown): Partial<Record<SyncRecordType, ParsedEntry>> | null {
  if (!isRecord(value)) return null;

  const parsed: Partial<Record<SyncRecordType, ParsedEntry>> = {};

  for (const recordType of ALLOWED_RECORD_TYPES) {
    const entry = value[recordType];
    if (!isRecord(entry)) continue;

    if (recordType === "steps") {
      const lastSyncedAt = parseDate(entry.lastSyncedAt);
      const backfilledFrom = parseDate(entry.backfilledFrom);
      if (!lastSyncedAt && !backfilledFrom) continue;
      parsed.steps = { type: "steps", lastSyncedAt, backfilledFrom };
    } else {
      const lastSyncedAt = parseDate(entry.lastSyncedAt);
      if (!lastSyncedAt) continue;
      parsed[recordType] = { type: "generic", lastSyncedAt };
    }
  }

  return Object.keys(parsed).length ? parsed : null;
}

function toResponse(doc: SyncStateDoc | null) {
  const recordTypes: Record<string, Record<string, string>> = {};

  for (const [recordType, entry] of Object.entries(doc?.recordTypes ?? {})) {
    if (!entry) continue;
    const out: Record<string, string> = {};
    if ("lastSyncedAt" in entry && entry.lastSyncedAt instanceof Date) {
      out.lastSyncedAt = entry.lastSyncedAt.toISOString();
    }
    if ("backfilledFrom" in entry && entry.backfilledFrom instanceof Date) {
      out.backfilledFrom = entry.backfilledFrom.toISOString();
    }
    if (Object.keys(out).length) {
      recordTypes[recordType] = out;
    }
  }

  return {
    provider: "health_connect" as const,
    recordTypes,
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

    const [syncState, account] = await Promise.all([
      db
        .collection<SyncStateDoc>(COLLECTIONS.HealthConnectSyncState)
        .findOne({ patientId, provider: "health_connect" }),
      db
        .collection<{ createdAt?: Date }>(COLLECTIONS.UsersAccounts)
        .findOne(
          { principalId: caller.principalId, isActive: true },
          { projection: { _id: 0, createdAt: 1 } },
        ),
    ]);

    return ok({
      ...toResponse(syncState),
      accountCreatedAt: account?.createdAt ? account.createdAt.toISOString() : null,
    });
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
      return bad("recordTypes must include at least one valid entry", undefined, 400);
    }

    const now = new Date();
    const patientId = new ObjectId(caller.patientId);
    const setFields: Record<string, unknown> = { updatedAt: now };

    for (const [recordType, entry] of Object.entries(recordTypes)) {
      if (!entry) continue;
      if (entry.type === "steps") {
        if (entry.lastSyncedAt) {
          setFields[`recordTypes.${recordType}.lastSyncedAt`] = entry.lastSyncedAt;
        }
        if (entry.backfilledFrom) {
          setFields[`recordTypes.${recordType}.backfilledFrom`] = entry.backfilledFrom;
        }
      } else {
        setFields[`recordTypes.${recordType}.lastSyncedAt`] = entry.lastSyncedAt;
      }
    }

    const db = await getDb();
    await db.collection<SyncStateDoc>(COLLECTIONS.HealthConnectSyncState).updateOne(
      { patientId, provider: "health_connect" },
      {
        $set: setFields,
        $setOnInsert: {
          createdAt: now,
          orgId: caller.orgId ?? "org_demo",
          patientId,
          provider: "health_connect",
        },
      },
      { upsert: true },
    );

    const syncState = await db
      .collection<SyncStateDoc>(COLLECTIONS.HealthConnectSyncState)
      .findOne({ patientId, provider: "health_connect" });

    return ok(toResponse(syncState));
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
