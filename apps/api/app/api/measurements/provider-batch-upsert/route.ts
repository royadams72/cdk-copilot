export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { ROLES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

const MAX_ITEMS = 200;

type AllowedKind = "heart_rate" | "sleep" | "exercise" | "blood_pressure";

const ALLOWED_KINDS: AllowedKind[] = [
  "heart_rate",
  "sleep",
  "exercise",
  "blood_pressure",
];

type ProviderBatchItem = {
  kind: AllowedKind;
  externalRecordId: string;
  measuredAt: Date;
  provider: { packageName: string; displayName?: string };
  device?: { externalId?: string; name?: string; platform?: string };
  // heart_rate
  bpm?: number;
  // sleep
  sleepFromAt?: Date;
  sleepToAt?: Date;
  durationMin?: number;
  // exercise
  exerciseId?: string;
  exerciseTitle?: string;
  category?: string;
  intensity?: "light" | "moderate" | "vigorous";
  met?: number;
  caloriesKcal?: number;
  // blood_pressure
  systolicMmHg?: number;
  diastolicMmHg?: number;
  pulseBpm?: number;
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

function asDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseItem(raw: unknown): ProviderBatchItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;

  const kind = asTrimmedString(input.kind);
  if (!kind || !ALLOWED_KINDS.includes(kind as AllowedKind)) return null;

  const externalRecordId = asTrimmedString(input.externalRecordId);
  if (!externalRecordId) return null;

  const measuredAt = asDate(input.measuredAt);
  if (!measuredAt) return null;

  const providerRaw = input.provider;
  if (!providerRaw || typeof providerRaw !== "object" || Array.isArray(providerRaw)) return null;
  const providerInput = providerRaw as Record<string, unknown>;
  const packageName = asTrimmedString(providerInput.packageName);
  if (!packageName) return null;
  const displayName = asTrimmedString(providerInput.displayName) ?? undefined;

  const item: ProviderBatchItem = {
    externalRecordId,
    kind: kind as AllowedKind,
    measuredAt,
    provider: { displayName, packageName },
  };

  // Device
  const deviceRaw = input.device;
  if (deviceRaw && typeof deviceRaw === "object" && !Array.isArray(deviceRaw)) {
    const d = deviceRaw as Record<string, unknown>;
    const externalId = asTrimmedString(d.externalId) ?? undefined;
    const name = asTrimmedString(d.name) ?? undefined;
    const platform = asTrimmedString(d.platform) ?? undefined;
    if (externalId || name || platform) {
      item.device = { externalId, name, platform };
    }
  }

  // Kind-specific validation
  if (kind === "heart_rate") {
    const bpm = asNumber(input.bpm);
    if (bpm === null || bpm <= 0) return null;
    item.bpm = Math.round(bpm);
  }

  if (kind === "sleep") {
    const sleepFromAt = asDate(input.sleepFromAt);
    const sleepToAt = asDate(input.sleepToAt);
    if (!sleepFromAt || !sleepToAt) return null;
    const msDiff = sleepToAt.getTime() - sleepFromAt.getTime();
    if (msDiff <= 0) return null;
    item.sleepFromAt = sleepFromAt;
    item.sleepToAt = sleepToAt;
    item.durationMin = Math.round(msDiff / 60000);
  }

  if (kind === "exercise") {
    const durationMin = asNumber(input.durationMin);
    if (durationMin === null || durationMin <= 0) return null;
    item.durationMin = Math.round(durationMin);
    item.caloriesKcal = Math.max(0, Math.round(asNumber(input.caloriesKcal) ?? 0));
    item.exerciseId = asTrimmedString(input.exerciseId) ?? "health_connect_exercise";
    item.exerciseTitle = asTrimmedString(input.exerciseTitle) ?? "Imported exercise";
    item.category = asTrimmedString(input.category) ?? "health_connect";
    const intensity = asTrimmedString(input.intensity);
    item.intensity =
      intensity === "light" || intensity === "vigorous" ? intensity : "moderate";
    item.met = asNumber(input.met) ?? 1;
  }

  if (kind === "blood_pressure") {
    const systolicMmHg = asNumber(input.systolicMmHg);
    const diastolicMmHg = asNumber(input.diastolicMmHg);
    if (
      systolicMmHg === null ||
      diastolicMmHg === null ||
      systolicMmHg <= diastolicMmHg
    ) return null;
    item.systolicMmHg = Math.round(systolicMmHg);
    item.diastolicMmHg = Math.round(diastolicMmHg);
    const pulseBpm = asNumber(input.pulseBpm);
    if (pulseBpm !== null && pulseBpm > 0) item.pulseBpm = Math.round(pulseBpm);
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

    const items: ProviderBatchItem[] = [];
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
        externalRecordId: item.externalRecordId,
        measuredAt: item.measuredAt,
        orgId,
        provider: item.provider,
        receivedAt: now,
        updatedAt: now,
        updatedBy: caller.principalId,
      };

      if (item.device) setFields.device = item.device;

      if (item.kind === "heart_rate") {
        setFields.bpm = item.bpm;
      }

      if (item.kind === "sleep") {
        setFields.sleepFromAt = item.sleepFromAt;
        setFields.sleepToAt = item.sleepToAt;
        setFields.durationMin = item.durationMin;
      }

      if (item.kind === "exercise") {
        const title = item.exerciseTitle ?? "Imported exercise";
        setFields.exercise = {
          caloriesKcal: item.caloriesKcal ?? 0,
          category: item.category ?? "health_connect",
          durationMin: item.durationMin!,
          exerciseId: item.exerciseId ?? "health_connect_exercise",
          intensity: item.intensity ?? "moderate",
          met: item.met ?? 1,
          name: title,
          title,
        };
      }

      if (item.kind === "blood_pressure") {
        setFields.systolicMmHg = item.systolicMmHg;
        setFields.diastolicMmHg = item.diastolicMmHg;
        if (typeof item.pulseBpm === "number") setFields.pulseBpm = item.pulseBpm;
      }

      return {
        updateOne: {
          filter: {
            externalRecordId: item.externalRecordId,
            kind: item.kind,
            orgId,
            patientId,
            "provider.packageName": item.provider.packageName,
          },
          update: {
            $set: setFields,
            $setOnInsert: {
              createdAt: now,
              createdBy: caller.principalId,
              kind: item.kind,
              patientId,
              source: "provider",
            },
          },
          upsert: true,
        },
      };
    });

    let result;
    try {
      result = await db
        .collection(COLLECTIONS.MeasurementsLedger)
        .bulkWrite(operations, { ordered: false });
    } catch (bulkErr: any) {
      // MongoBulkWriteError is thrown even with ordered:false when any write
      // fails. The partial result is available on err.result — use it so
      // successful operations are not silently lost.
      const partialResult = bulkErr?.result;
      const writeErrors: unknown[] = bulkErr?.writeErrors ?? [];
      const firstMessage: string =
        writeErrors.length > 0
          ? (writeErrors[0] as any)?.errmsg ?? (writeErrors[0] as any)?.message ?? bulkErr.message
          : bulkErr.message ?? "Bulk write error";

      console.error("provider-batch-upsert bulkWrite error", {
        firstMessage,
        writeErrorCount: writeErrors.length,
        inserted: partialResult?.upsertedCount ?? 0,
        matched: partialResult?.matchedCount ?? 0,
        modified: partialResult?.modifiedCount ?? 0,
      });

      // If some operations succeeded, return them alongside the error count.
      if (partialResult && (partialResult.upsertedCount + partialResult.matchedCount) > 0) {
        return ok({
          errors: writeErrors.length,
          firstError: firstMessage,
          inserted: partialResult.upsertedCount,
          matched: partialResult.matchedCount,
          modified: partialResult.modifiedCount,
          total: items.length,
        });
      }

      return bad(firstMessage, undefined, 422);
    }

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
