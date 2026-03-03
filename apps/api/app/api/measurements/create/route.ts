export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { Db, ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { ROLES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

type Kind = "steps" | "exercise" | "sleep" | "blood_pressure";
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

async function resolveWeightKg(db: Db, patientId: ObjectId): Promise<number | null> {
  const latestWeight = await db.collection(COLLECTIONS.MeasurementsLedger).findOne(
    { kind: "weight", patientId },
    { projection: { _id: 0, valueKg: 1 }, sort: { measuredAt: -1, receivedAt: -1 } },
  );
  if (typeof latestWeight?.valueKg === "number" && latestWeight.valueKg > 0) {
    return latestWeight.valueKg;
  }

  const clinical = await db.collection(COLLECTIONS.UsersClinical).findOne(
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

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const kind = body.kind as Kind;
    if (
      kind !== "steps" &&
      kind !== "exercise" &&
      kind !== "sleep" &&
      kind !== "blood_pressure"
    ) {
      return bad("Invalid kind", undefined, 400);
    }

    const measuredAtRaw =
      typeof body.measuredAt === "string" ? new Date(body.measuredAt) : new Date();
    if (Number.isNaN(measuredAtRaw.getTime())) {
      return bad("Invalid measuredAt", undefined, 400);
    }

    const db = await getDb();
    const now = new Date();
    const payload: Record<string, unknown> = {
      kind,
      patientId: new ObjectId(caller.patientId),
      orgId: caller.orgId ?? "org_demo",
      measuredAt: measuredAtRaw,
      receivedAt: new Date(),
      source: "patient",
      createdAt: now,
      updatedAt: now,
      createdBy: caller.principalId,
      updatedBy: caller.principalId,
    };

    if (kind === "steps") {
      const count = asNumber(body.count);
      if (count === null || count < 0) return bad("Invalid count", undefined, 400);
      payload.count = Math.round(count);
    }
    if (kind === "sleep") {
      const sleepFromAt = asDate(body.sleepFromAt);
      const sleepToAt = asDate(body.sleepToAt);

      if (!sleepFromAt || !sleepToAt) {
        return bad(
          "sleepFromAt and sleepToAt are required",
          undefined,
          400,
        );
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
      if (!exerciseId) return bad("exerciseId is required", undefined, 400);
      if (durationMin === null || durationMin <= 0) {
        return bad("Invalid durationMin", undefined, 400);
      }

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
        exerciseId: exerciseRef.exerciseId,
        title: exerciseRef.name,
        name: exerciseRef.name,
        category: exerciseRef.category,
        intensity: exerciseRef.intensity,
        met: exerciseRef.met,
        durationMin: Math.round(durationMin),
        caloriesKcal: Math.round(caloriesKcal),
      };
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

    const candidates: Array<Record<string, unknown>> = [payload];

    // Backward-compatibility: some environments still validate exercise as
    // { durationMin, caloriesKcal } only.
    if (kind === "exercise" && payload.exercise && typeof payload.exercise === "object") {
      const legacyExercise = payload.exercise as Record<string, unknown>;
      candidates.push({
        ...payload,
        exercise: {
          durationMin: legacyExercise.durationMin,
          caloriesKcal: legacyExercise.caloriesKcal,
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

    let result: any = null;
    let lastErr: any = null;
    for (const candidate of candidates) {
      try {
        result = await db.collection(COLLECTIONS.MeasurementsLedger).insertOne(candidate);
        break;
      } catch (err: any) {
        lastErr = err;
        if (err?.code !== 121) throw err;
      }
    }
    if (!result) throw lastErr ?? new Error("Failed to save measurement");

    return ok({ id: result.insertedId.toString() }, 201);
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(formatMongoValidationMessage(err), undefined, status);
  }
}
