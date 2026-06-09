export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { isHealthSyncProvider, type HealthSyncProvider } from "@/apps/api/lib/healthSync/provider";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { ROLES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

const MAX_ITEMS = 120;

type StepsBatchItem = {
  averageSpeedKph?: number;
  caloriesKcal?: number;
  count: number;
  distanceMeters?: number;
  externalRecordId: string;
  measuredAt: string;
  provider: { displayName?: string; packageName: string };
  sync?: {
    dayKey?: string;
    finalizedAt?: string;
    lastReconciledAt?: string;
    provider: HealthSyncProvider;
    status: "provisional" | "finalized";
  };
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t || null;
}

function parseItem(raw: unknown): StepsBatchItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;

  const count = asNumber(input.count);
  if (count === null || count < 0) return null;

  const measuredAt = asTrimmedString(input.measuredAt);
  if (!measuredAt || Number.isNaN(new Date(measuredAt).getTime())) return null;

  const externalRecordId = asTrimmedString(input.externalRecordId);
  if (!externalRecordId) return null;

  const providerRaw = input.provider;
  if (!providerRaw || typeof providerRaw !== "object" || Array.isArray(providerRaw)) return null;
  const providerInput = providerRaw as Record<string, unknown>;
  const packageName = asTrimmedString(providerInput.packageName);
  if (!packageName) return null;
  const displayName = asTrimmedString(providerInput.displayName) ?? undefined;

  const item: StepsBatchItem = {
    count: Math.round(count),
    externalRecordId,
    measuredAt,
    provider: { displayName, packageName },
  };

  const distanceMeters = asNumber(input.distanceMeters);
  if (distanceMeters !== null && distanceMeters >= 0) item.distanceMeters = distanceMeters;

  const caloriesKcal = asNumber(input.caloriesKcal);
  if (caloriesKcal !== null && caloriesKcal >= 0) item.caloriesKcal = caloriesKcal;

  const averageSpeedKph = asNumber(input.averageSpeedKph);
  if (averageSpeedKph !== null && averageSpeedKph >= 0) item.averageSpeedKph = averageSpeedKph;

  const syncRaw = input.sync;
  if (syncRaw && typeof syncRaw === "object" && !Array.isArray(syncRaw)) {
    const s = syncRaw as Record<string, unknown>;
    const syncProvider = asTrimmedString(s.provider);
    const syncStatus = asTrimmedString(s.status);
    if (
      isHealthSyncProvider(syncProvider) &&
      (syncStatus === "provisional" || syncStatus === "finalized")
    ) {
      item.sync = {
        provider: syncProvider,
        status: syncStatus,
        dayKey: asTrimmedString(s.dayKey) ?? undefined,
        finalizedAt: asTrimmedString(s.finalizedAt) ?? undefined,
        lastReconciledAt: asTrimmedString(s.lastReconciledAt) ?? undefined,
      };
    }
  }

  return item;
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

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const rawItems = body.items;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return bad("items must be a non-empty array", undefined, 400);
    }
    if (rawItems.length > MAX_ITEMS) {
      return bad(`items must not exceed ${MAX_ITEMS}`, undefined, 400);
    }

    const items: StepsBatchItem[] = [];
    for (const raw of rawItems) {
      const parsed = parseItem(raw);
      if (!parsed) return bad("One or more items are invalid", undefined, 400);
      items.push(parsed);
    }

    const db = await getDb();
    const now = new Date();
    const patientId = new ObjectId(caller.patientId);
    const orgId = caller.orgId ?? "org_demo";

    const operations = items.map((item) => {
      const setFields: Record<string, unknown> = {
        count: item.count,
        externalRecordId: item.externalRecordId,
        measuredAt: new Date(item.measuredAt),
        orgId,
        provider: item.provider,
        receivedAt: now,
        updatedAt: now,
        updatedBy: caller.principalId,
      };

      if (item.sync) {
        setFields.sync = {
          provider: item.sync.provider,
          status: item.sync.status,
          ...(item.sync.dayKey ? { dayKey: item.sync.dayKey } : {}),
          ...(item.sync.finalizedAt ? { finalizedAt: new Date(item.sync.finalizedAt) } : {}),
          ...(item.sync.lastReconciledAt ? { lastReconciledAt: new Date(item.sync.lastReconciledAt) } : {}),
        };
      }
      if (typeof item.distanceMeters === "number") setFields.distanceMeters = item.distanceMeters;
      if (typeof item.caloriesKcal === "number") setFields.caloriesKcal = item.caloriesKcal;
      if (typeof item.averageSpeedKph === "number") setFields.averageSpeedKph = item.averageSpeedKph;

      if (
        typeof item.distanceMeters === "number" ||
        typeof item.caloriesKcal === "number" ||
        typeof item.averageSpeedKph === "number"
      ) {
        setFields.steps = {
          ...(typeof item.averageSpeedKph === "number" ? { averageSpeedKph: item.averageSpeedKph } : {}),
          ...(typeof item.caloriesKcal === "number" ? { caloriesKcal: item.caloriesKcal } : {}),
          ...(typeof item.distanceMeters === "number" ? { distanceMeters: item.distanceMeters } : {}),
        };
      }

      return {
        updateOne: {
          filter: {
            externalRecordId: item.externalRecordId,
            kind: "steps",
            orgId,
            patientId,
            "provider.packageName": item.provider.packageName,
          },
          update: {
            $set: setFields,
            $setOnInsert: {
              createdAt: now,
              createdBy: caller.principalId,
              kind: "steps",
              patientId,
              source: "provider",
            },
          },
          upsert: true,
        },
      };
    });

    const result = await db
      .collection(COLLECTIONS.MeasurementsLedger)
      .bulkWrite(operations, { ordered: false });

    return ok({
      inserted: result.upsertedCount,
      matched: result.matchedCount,
      modified: result.modifiedCount,
      total: items.length,
    });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
