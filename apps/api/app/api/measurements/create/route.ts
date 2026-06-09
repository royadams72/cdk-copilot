export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { Db, ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { isHealthSyncProvider, type HealthSyncProvider } from "@/apps/api/lib/healthSync/provider";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  awardExerciseDaysEngagement,
  awardSleepLoggingEngagement,
  awardStepsEngagement,
  awardWeightLossWeeksEngagement,
} from "@/apps/api/lib/utils/patientEngagement";
import { ROLES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

type Kind =
  | "steps"
  | "exercise"
  | "sleep"
  | "weight"
  | "blood_pressure"
  | "heart_rate";
type Source = "patient" | "device" | "api" | "provider";
type DeviceMeta = {
  externalId?: string;
  name?: string;
  platform?: string;
};
type ProviderMeta = {
  displayName?: string;
  packageName: string;
};
type SyncMeta = {
  dayKey?: string;
  finalizedAt?: Date;
  lastReconciledAt?: Date;
  provider: HealthSyncProvider;
  status: "provisional" | "finalized";
};
type ExerciseReferenceDoc = {
  category: string;
  exerciseId: string;
  intensity: "light" | "moderate" | "vigorous";
  met: number;
  name: string;
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asSource(value: unknown): Source {
  return value === "device" || value === "api" || value === "provider"
    ? value
    : "patient";
}

function asDeviceMeta(value: unknown): DeviceMeta | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const device: DeviceMeta = {};
  const externalId = asTrimmedString(input.externalId);
  const name = asTrimmedString(input.name);
  const platform = asTrimmedString(input.platform);
  if (externalId) device.externalId = externalId;
  if (name) device.name = name;
  if (platform) device.platform = platform;
  return Object.keys(device).length ? device : null;
}

function asProviderMeta(value: unknown): ProviderMeta | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const packageName = asTrimmedString(input.packageName);
  if (!packageName) return null;

  const provider: ProviderMeta = { packageName };
  const displayName = asTrimmedString(input.displayName);
  if (displayName) provider.displayName = displayName;
  return provider;
}

function asSyncMeta(value: unknown): SyncMeta | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;
  const provider = asTrimmedString(input.provider);
  const status = asTrimmedString(input.status);
  if (
    !isHealthSyncProvider(provider) ||
    (status !== "provisional" && status !== "finalized")
  ) {
    return null;
  }

  const sync: SyncMeta = {
    provider,
    status,
  };
  const dayKey = asTrimmedString(input.dayKey);
  if (dayKey) {
    sync.dayKey = dayKey;
  }
  const finalizedAt = asDate(input.finalizedAt);
  if (finalizedAt) {
    sync.finalizedAt = finalizedAt;
  }
  const lastReconciledAt = asDate(input.lastReconciledAt);
  if (lastReconciledAt) {
    sync.lastReconciledAt = lastReconciledAt;
  }
  return sync;
}

function startOfUtcDay(date: Date) {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function providerUpsertFilter(payload: Record<string, unknown>) {
  if (
    !payload.externalRecordId ||
    typeof payload.externalRecordId !== "string"
  ) {
    return null;
  }
  const providerPackageName =
    payload.provider &&
    typeof payload.provider === "object" &&
    !Array.isArray(payload.provider) &&
    typeof (payload.provider as Record<string, unknown>).packageName ===
      "string"
      ? ((payload.provider as Record<string, unknown>).packageName as string)
      : null;

  if (providerPackageName) {
    return {
      externalRecordId: payload.externalRecordId,
      kind: payload.kind,
      orgId: payload.orgId,
      patientId: payload.patientId,
      "provider.packageName": providerPackageName,
    };
  }

  return {
    externalRecordId: payload.externalRecordId,
    kind: payload.kind,
    orgId: payload.orgId,
    patientId: payload.patientId,
    source: payload.source,
  };
}

async function saveMeasurement(
  db: Db,
  payload: Record<string, unknown>,
): Promise<{ id: string | null; status: number; updated: boolean }> {
  const filter = providerUpsertFilter(payload);
  if (filter) {
    const setFields = { ...payload };
    delete setFields.createdAt;
    delete setFields.createdBy;
    delete setFields.kind;
    delete setFields.patientId;

    const update = {
      $set: setFields,
      $setOnInsert: {
        createdAt: payload.createdAt,
        createdBy: payload.createdBy,
        kind: payload.kind,
        patientId: payload.patientId,
      },
    };

    let result: any = null;
    try {
      result = await db
        .collection(COLLECTIONS.MeasurementsLedger)
        .updateOne(filter, update, { upsert: true });
    } catch (err: any) {
      if (err?.code !== 121) throw err;
      const fallbackSetFields = { ...setFields };
      delete fallbackSetFields.updatedAt;
      const fallbackSetOnInsert = { ...update.$setOnInsert };
      delete fallbackSetOnInsert.createdAt;
      result = await db.collection(COLLECTIONS.MeasurementsLedger).updateOne(
        filter,
        {
          $set: fallbackSetFields,
          $setOnInsert: fallbackSetOnInsert,
        },
        { upsert: true },
      );
    }

    return {
      id: result.upsertedId?.toString() ?? null,
      status: result.upsertedCount ? 201 : 200,
      updated: result.matchedCount > 0,
    };
  }

  const candidates: Array<Record<string, unknown>> = [payload];

  // Backward-compatibility: some environments still validate exercise as
  // { durationMin, caloriesKcal } only.
  if (
    payload.kind === "exercise" &&
    payload.exercise &&
    typeof payload.exercise === "object"
  ) {
    const legacyExercise = payload.exercise as Record<string, unknown>;
    candidates.push({
      ...payload,
      exercise: {
        caloriesKcal: legacyExercise.caloriesKcal,
        durationMin: legacyExercise.durationMin,
      },
    });
  }

  // Compatibility retry for environments where validator disallows createdAt/updatedAt.
  const auditStripped = candidates.map((candidate) => {
    const fallback = { ...candidate };
    delete fallback.createdAt;
    delete fallback.updatedAt;
    return fallback;
  });
  candidates.push(...auditStripped);
  console.dir(candidates, { depth: null });

  let result: any = null;
  let lastErr: any = null;
  for (const candidate of candidates) {
    try {
      result = await db
        .collection(COLLECTIONS.MeasurementsLedger)
        .insertOne(candidate);
      break;
    } catch (err: any) {
      lastErr = err;
      if (err?.code !== 121) throw err;
    }
  }
  if (!result) throw lastErr ?? new Error("Failed to save measurement");

  return {
    id: result.insertedId.toString(),
    status: 201,
    updated: false,
  };
}

function formatMongoValidationMessage(err: any) {
  if (!err || err?.code !== 121) return err?.message || "Server error";
  const details = err?.errInfo?.details;
  if (!details) return err?.message || "Document failed validation";
  const rules = Array.isArray(details?.schemaRulesNotSatisfied)
    ? details.schemaRulesNotSatisfied
    : [];
  const rejectsId = rules.some(
    (rule: any) =>
      rule?.operatorName === "additionalProperties" &&
      Array.isArray(rule?.additionalProperties) &&
      rule.additionalProperties.includes("_id"),
  );
  if (rejectsId) {
    return "Document failed validation: measurements_ledger validator is out of date (missing _id). Run db:apply-validators.";
  }
  try {
    return `Document failed validation: ${JSON.stringify(details)}`;
  } catch {
    return err?.message || "Document failed validation";
  }
}

async function resolveWeightKg(
  db: Db,
  patientId: ObjectId,
): Promise<number | null> {
  const latestWeight = await db
    .collection(COLLECTIONS.MeasurementsLedger)
    .findOne(
      { kind: "weight", patientId },
      {
        projection: { _id: 0, valueKg: 1 },
        sort: { measuredAt: -1, receivedAt: -1 },
      },
    );
  if (typeof latestWeight?.valueKg === "number" && latestWeight.valueKg > 0) {
    return latestWeight.valueKg;
  }

  const clinical = await db
    .collection(COLLECTIONS.UsersClinical)
    .findOne(
      { patientId },
      { projection: { _id: 0, weightKg: 1 }, sort: { updatedAt: -1 } },
    );
  if (typeof clinical?.weightKg === "number" && clinical.weightKg > 0) {
    return clinical.weightKg;
  }

  return null;
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

    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const kind = body.kind as Kind;
    if (
      kind !== "steps" &&
      kind !== "exercise" &&
      kind !== "sleep" &&
      kind !== "weight" &&
      kind !== "blood_pressure" &&
      kind !== "heart_rate"
    ) {
      return bad("Invalid kind", undefined, 400);
    }

    const measuredAtRaw =
      typeof body.measuredAt === "string"
        ? new Date(body.measuredAt)
        : new Date();
    if (Number.isNaN(measuredAtRaw.getTime())) {
      return bad("Invalid measuredAt", undefined, 400);
    }

    const source = asSource(body.source);
    const provider = asProviderMeta(body.provider);
    const externalRecordId = asTrimmedString(body.externalRecordId);
    const device = asDeviceMeta(body.device);
    const sync = asSyncMeta(body.sync);

    const db = await getDb();
    const now = new Date();
    const payload: Record<string, unknown> = {
      createdAt: now,
      createdBy: caller.principalId,
      kind,
      measuredAt: measuredAtRaw,
      orgId: caller.orgId ?? "org_demo",
      patientId: new ObjectId(caller.patientId),
      receivedAt: new Date(),
      source,
      updatedAt: now,
      updatedBy: caller.principalId,
    };
    if (provider) payload.provider = provider;
    if (externalRecordId) payload.externalRecordId = externalRecordId;
    if (device) payload.device = device;
    if (sync) payload.sync = sync;

    if (kind === "steps") {
      const count = asNumber(body.count);
      if (count === null || count < 0)
        return bad("Invalid count", undefined, 400);
      payload.count = Math.round(count);
      const distanceMeters = asNumber(body.distanceMeters);
      const caloriesKcal = asNumber(body.caloriesKcal);
      const averageSpeedKph = asNumber(body.averageSpeedKph);
      if (distanceMeters !== null && distanceMeters >= 0) {
        payload.distanceMeters = distanceMeters;
      }
      if (caloriesKcal !== null && caloriesKcal >= 0) {
        payload.caloriesKcal = caloriesKcal;
      }
      if (averageSpeedKph !== null && averageSpeedKph >= 0) {
        payload.averageSpeedKph = averageSpeedKph;
      }
      if (
        typeof payload.distanceMeters === "number" ||
        typeof payload.caloriesKcal === "number" ||
        typeof payload.averageSpeedKph === "number"
      ) {
        payload.steps = {
          averageSpeedKph:
            typeof payload.averageSpeedKph === "number"
              ? payload.averageSpeedKph
              : undefined,
          caloriesKcal:
            typeof payload.caloriesKcal === "number"
              ? payload.caloriesKcal
              : undefined,
          distanceMeters:
            typeof payload.distanceMeters === "number"
              ? payload.distanceMeters
              : undefined,
        };
      }
    }
    if (kind === "weight") {
      const valueKg = asNumber(body.valueKg);
      if (valueKg === null || valueKg <= 0) {
        return bad("Invalid valueKg", undefined, 400);
      }
      payload.valueKg = Math.round(valueKg * 10) / 10;
    }
    if (kind === "sleep") {
      const sleepFromAt = asDate(body.sleepFromAt);
      const sleepToAt = asDate(body.sleepToAt);

      if (!sleepFromAt || !sleepToAt) {
        return bad("sleepFromAt and sleepToAt are required", undefined, 400);
      }
      const msDiff = sleepToAt.getTime() - sleepFromAt.getTime();
      if (msDiff <= 0) {
        return bad("sleepToAt must be after sleepFromAt", undefined, 400);
      }
      payload.sleepFromAt = sleepFromAt;
      payload.sleepToAt = sleepToAt;
      payload.durationMin = Math.round(msDiff / 60000);
      payload.measuredAt = sleepToAt;
    }
    if (kind === "exercise") {
      const durationMin = asNumber(body.durationMin);
      const exerciseId =
        typeof body.exerciseId === "string" ? body.exerciseId.trim() : "";
      if (durationMin === null || durationMin <= 0) {
        return bad("Invalid durationMin", undefined, 400);
      }

      if (source === "provider") {
        const title =
          asTrimmedString(body.exerciseTitle) ??
          asTrimmedString(body.name) ??
          "Imported exercise";
        payload.exercise = {
          caloriesKcal: Math.max(
            0,
            Math.round(asNumber(body.caloriesKcal) ?? 0),
          ),
          category: asTrimmedString(body.category) ?? "health_connect",
          durationMin: Math.round(durationMin),
          exerciseId: exerciseId || "health_connect_exercise",
          intensity:
            body.intensity === "light" ||
            body.intensity === "moderate" ||
            body.intensity === "vigorous"
              ? body.intensity
              : "moderate",
          met: asNumber(body.met) ?? 1,
          name: title,
          title,
        };
      } else {
        if (!exerciseId) return bad("exerciseId is required", undefined, 400);

        const exerciseRef = await db
          .collection<ExerciseReferenceDoc>(COLLECTIONS.ExerciseReference)
          .findOne(
            { exerciseId },
            {
              projection: {
                _id: 0,
                category: 1,
                exerciseId: 1,
                intensity: 1,
                met: 1,
                name: 1,
              },
            },
          );
        if (!exerciseRef) {
          return bad("Unknown exerciseId", undefined, 400);
        }

        const weightKg = await resolveWeightKg(
          db,
          new ObjectId(caller.patientId),
        );
        if (!weightKg) {
          return bad(
            "Weight is required to calculate calories. Please add your weight first.",
            undefined,
            400,
          );
        }

        const caloriesKcal =
          exerciseRef.met * weightKg * (Math.round(durationMin) / 60);
        payload.exercise = {
          caloriesKcal: Math.round(caloriesKcal),
          category: exerciseRef.category,
          durationMin: Math.round(durationMin),
          exerciseId: exerciseRef.exerciseId,
          intensity: exerciseRef.intensity,
          met: exerciseRef.met,
          name: exerciseRef.name,
          title: exerciseRef.name,
        };
      }
    }
    if (kind === "blood_pressure") {
      const systolicMmHg = asNumber(body.systolicMmHg);
      const diastolicMmHg = asNumber(body.diastolicMmHg);
      if (
        systolicMmHg === null ||
        diastolicMmHg === null ||
        systolicMmHg <= diastolicMmHg
      ) {
        return bad("Invalid blood pressure values", undefined, 400);
      }
      payload.systolicMmHg = Math.round(systolicMmHg);
      payload.diastolicMmHg = Math.round(diastolicMmHg);
      const pulseBpm = asNumber(body.pulseBpm);
      if (pulseBpm !== null) payload.pulseBpm = Math.round(pulseBpm);
    }
    if (kind === "heart_rate") {
      const bpm = asNumber(body.bpm);
      if (bpm === null || bpm <= 0) return bad("Invalid bpm", undefined, 400);
      payload.bpm = Math.round(bpm);
    }

    if (kind === "steps") {
      const dayStart = startOfUtcDay(measuredAtRaw);
      const dayEnd = addDays(dayStart, 1);
      const filter =
        provider && externalRecordId
          ? {
              externalRecordId,
              kind: "steps",
              orgId: payload.orgId,
              patientId: payload.patientId,
              "provider.packageName": provider.packageName,
            }
          : {
              kind: "steps",
              measuredAt: { $gte: dayStart, $lt: dayEnd },
              orgId: payload.orgId,
              patientId: payload.patientId,
              source: payload.source,
            };
      const setFields: Record<string, unknown> = {
        count: payload.count,
        measuredAt: payload.measuredAt,
        orgId: payload.orgId,
        receivedAt: payload.receivedAt,
        updatedAt: payload.updatedAt,
        updatedBy: payload.updatedBy,
      };
      const setOnInsertFields: Record<string, unknown> = {
        createdAt: payload.createdAt,
        createdBy: payload.createdBy,
        kind: "steps",
        patientId: payload.patientId,
        source: payload.source,
      };
      if (provider) {
        setFields.provider = provider;
      }
      if (externalRecordId) {
        setFields.externalRecordId = externalRecordId;
      }
      if (device) {
        setFields.device = device;
      }
      if (sync) {
        setFields.sync = sync;
      }
      if (typeof payload.distanceMeters === "number") {
        setFields.distanceMeters = payload.distanceMeters;
      }
      if (typeof payload.caloriesKcal === "number") {
        setFields.caloriesKcal = payload.caloriesKcal;
      }
      if (typeof payload.averageSpeedKph === "number") {
        setFields.averageSpeedKph = payload.averageSpeedKph;
      }
      if (payload.steps && typeof payload.steps === "object") {
        setFields.steps = payload.steps;
      }
      const update = {
        $set: setFields,
        $setOnInsert: setOnInsertFields,
      };

      let result: any = null;
      try {
        result = await db
          .collection(COLLECTIONS.MeasurementsLedger)
          .updateOne(filter, update, { upsert: true });
      } catch (err: any) {
        if (err?.code !== 121) throw err;
        const fallbackSetFields = { ...setFields };
        delete fallbackSetFields.updatedAt;
        delete fallbackSetFields.steps;
        const fallbackSetOnInsertFields = { ...setOnInsertFields };
        delete fallbackSetOnInsertFields.createdAt;
        const fallbackUpdate = {
          $set: fallbackSetFields,
          $setOnInsert: fallbackSetOnInsertFields,
        };
        result = await db
          .collection(COLLECTIONS.MeasurementsLedger)
          .updateOne(filter, fallbackUpdate, { upsert: true });
      }

      await awardStepsEngagement(db, {
        count: typeof payload.count === "number" ? payload.count : 0,
        measuredAt: payload.measuredAt as Date,
        orgId: payload.orgId as string,
        patientId: payload.patientId as ObjectId,
      });

      return ok(
        {
          id: result.upsertedId?.toString() ?? null,
          updated: result.matchedCount > 0,
        },
        result.upsertedCount ? 201 : 200,
      );
    }

    const result = await saveMeasurement(db, payload);
    if (kind === "sleep") {
      await awardSleepLoggingEngagement(db, {
        measuredAt: payload.measuredAt as Date,
        orgId: payload.orgId as string,
        patientId: payload.patientId as ObjectId,
        source: payload.source as string,
      });
    }
    if (kind === "exercise") {
      await awardExerciseDaysEngagement(db, {
        measuredAt: payload.measuredAt as Date,
        orgId: payload.orgId as string,
        patientId: payload.patientId as ObjectId,
      });
    }
    if (kind === "weight") {
      await awardWeightLossWeeksEngagement(db, {
        measuredAt: payload.measuredAt as Date,
        orgId: payload.orgId as string,
        patientId: payload.patientId as ObjectId,
      });
    }
    return ok({ id: result.id, updated: result.updated }, result.status);
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(formatMongoValidationMessage(err), undefined, status);
  }
}
