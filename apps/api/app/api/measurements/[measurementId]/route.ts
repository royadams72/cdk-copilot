export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { Db, ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { ROLES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

type EditableMeasurementKind =
  | "exercise"
  | "sleep"
  | "blood_pressure"
  | "heart_rate"
  | "weight";

type MeasurementDoc = {
  _id: ObjectId;
  device?: {
    externalId?: string;
  };
  diastolicMmHg?: number;
  exercise?: {
    caloriesKcal?: number;
    category?: string;
    durationMin?: number;
    exerciseId?: string;
    intensity?: "light" | "moderate" | "vigorous";
    met?: number;
    name?: string;
    title?: string;
  };
  externalRecordId?: string;
  kind: EditableMeasurementKind | string;
  measuredAt: Date;
  orgId?: string;
  patientId: ObjectId;
  provider?: {
    packageName?: string;
  };
  valueKg?: number;
  sleepFromAt?: Date;
  sleepToAt?: Date;
  source?: "patient" | "device" | "api" | "provider";
  bpm?: number;
  systolicMmHg?: number;
  updatedAt?: Date;
  updatedBy?: string;
};

type ExerciseReferenceDoc = {
  category: string;
  exerciseId: string;
  intensity: "light" | "moderate" | "vigorous";
  met: number;
  name: string;
};

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isEditableKind(kind: string): kind is EditableMeasurementKind {
  return (
    kind === "exercise" ||
    kind === "sleep" ||
    kind === "blood_pressure" ||
    kind === "heart_rate" ||
    kind === "weight"
  );
}

function canMutateMeasurement(doc: MeasurementDoc) {
  return (
    doc.source === "patient" &&
    !doc.externalRecordId &&
    !doc.provider?.packageName &&
    !doc.device?.externalId
  );
}

async function requireEditableMeasurement(
  db: Db,
  measurementId: string,
  patientId: ObjectId,
) {
  const measurement = await db
    .collection<MeasurementDoc>(COLLECTIONS.MeasurementsLedger)
    .findOne({ _id: new ObjectId(measurementId), patientId });

  if (!measurement) {
    return { error: bad("Measurement not found", undefined, 404) } as const;
  }

  if (!isEditableKind(measurement.kind)) {
    return {
      error: bad("This measurement type cannot be edited here", undefined, 400),
    } as const;
  }

  if (!canMutateMeasurement(measurement)) {
    return {
      error: bad(
        "Only measurements added manually in the app can be changed",
        undefined,
        403,
      ),
    } as const;
  }

  return { measurement } as const;
}

async function buildExerciseUpdate(
  db: Db,
  measurement: MeasurementDoc,
  body: Record<string, unknown>,
) {
  const measuredAt = asDate(body.measuredAt);
  const durationMin = asNumber(body.durationMin);
  const exerciseId = asTrimmedString(body.exerciseId);

  if (!measuredAt || !durationMin || durationMin <= 0 || !exerciseId) {
    return { error: bad("Invalid exercise update", undefined, 400) } as const;
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
    return { error: bad("Unknown exerciseId", undefined, 400) } as const;
  }

  const weightDoc = await db
    .collection<{ measuredAt: Date; valueKg?: number }>(COLLECTIONS.MeasurementsLedger)
    .find(
      {
        kind: "weight",
        patientId: measurement.patientId,
        measuredAt: { $lte: measuredAt },
      },
      {
        projection: { _id: 0, measuredAt: 1, valueKg: 1 },
      },
    )
    .sort({ measuredAt: -1 })
    .limit(1)
    .next();

  const weightKg =
    typeof weightDoc?.valueKg === "number" && Number.isFinite(weightDoc.valueKg)
      ? weightDoc.valueKg
      : 70;
  const caloriesKcal =
    exerciseRef.met * weightKg * (Math.round(durationMin) / 60);

  return {
    update: {
      $set: {
        exercise: {
          caloriesKcal: Math.round(caloriesKcal),
          category: exerciseRef.category,
          durationMin: Math.round(durationMin),
          exerciseId: exerciseRef.exerciseId,
          intensity: exerciseRef.intensity,
          met: exerciseRef.met,
          name: exerciseRef.name,
          title: exerciseRef.name,
        },
        measuredAt,
      },
    },
  } as const;
}

function buildSleepUpdate(body: Record<string, unknown>) {
  const sleepFromAt = asDate(body.sleepFromAt);
  const sleepToAt = asDate(body.sleepToAt);

  if (!sleepFromAt || !sleepToAt) {
    return { error: bad("sleepFromAt and sleepToAt are required", undefined, 400) } as const;
  }

  const durationMin = Math.round((sleepToAt.getTime() - sleepFromAt.getTime()) / 60000);
  if (durationMin <= 0) {
    return { error: bad("sleepToAt must be after sleepFromAt", undefined, 400) } as const;
  }

  return {
    update: {
      $set: {
        durationMin,
        measuredAt: sleepToAt,
        sleepFromAt,
        sleepToAt,
      },
    },
  } as const;
}

function buildBloodPressureUpdate(body: Record<string, unknown>) {
  const measuredAt = asDate(body.measuredAt);
  const systolicMmHg = asNumber(body.systolicMmHg);
  const diastolicMmHg = asNumber(body.diastolicMmHg);

  if (
    !measuredAt ||
    systolicMmHg === null ||
    diastolicMmHg === null ||
    systolicMmHg <= diastolicMmHg
  ) {
    return { error: bad("Invalid blood pressure update", undefined, 400) } as const;
  }

  return {
    update: {
      $set: {
        diastolicMmHg: Math.round(diastolicMmHg),
        measuredAt,
        systolicMmHg: Math.round(systolicMmHg),
      },
    },
  } as const;
}

function buildHeartRateUpdate(body: Record<string, unknown>) {
  const measuredAt = asDate(body.measuredAt);
  const bpm = asNumber(body.bpm);

  if (!measuredAt || bpm === null || bpm <= 0) {
    return { error: bad("Invalid heart rate update", undefined, 400) } as const;
  }

  return {
    update: {
      $set: {
        bpm: Math.round(bpm),
        measuredAt,
      },
    },
  } as const;
}

function buildWeightUpdate(body: Record<string, unknown>) {
  const measuredAt = asDate(body.measuredAt);
  const valueKg = asNumber(body.valueKg);

  if (!measuredAt || valueKg === null || valueKg <= 0) {
    return { error: bad("Invalid weight update", undefined, 400) } as const;
  }

  return {
    update: {
      $set: {
        measuredAt,
        valueKg: Math.round(valueKg * 10) / 10,
      },
    },
  } as const;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ measurementId: string }> },
) {
  try {
    const caller = await requireUser(req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !caller.principalId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }

    const { measurementId } = await context.params;
    if (!ObjectId.isValid(measurementId)) {
      return bad("Invalid measurement id", undefined, 400);
    }

    const db = await getDb();
    const patientId = new ObjectId(caller.patientId);
    const existing = await requireEditableMeasurement(db, measurementId, patientId);
    if ("error" in existing) {
      return existing.error;
    }

    const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<
      string,
      unknown
    >;
    const measurement = existing.measurement;
    const kind = measurement.kind;
    const now = new Date();

    const result =
      kind === "exercise"
        ? await buildExerciseUpdate(db, measurement, body)
        : kind === "sleep"
          ? buildSleepUpdate(body)
          : kind === "blood_pressure"
            ? buildBloodPressureUpdate(body)
            : kind === "heart_rate"
              ? buildHeartRateUpdate(body)
              : buildWeightUpdate(body);

    if ("error" in result) {
      return result.error;
    }

    await db.collection(COLLECTIONS.MeasurementsLedger).updateOne(
      { _id: measurement._id, patientId },
      {
        ...result.update,
        $set: {
          ...result.update.$set,
          updatedAt: now,
          updatedBy: caller.principalId,
        },
      },
    );

    return ok({
      id: measurement._id.toHexString(),
      updated: true,
    });
  } catch (err: any) {
    return bad(err?.message || "Unable to update measurement", undefined, err?.status || 500);
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ measurementId: string }> },
) {
  try {
    const caller = await requireUser(req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }

    const { measurementId } = await context.params;
    if (!ObjectId.isValid(measurementId)) {
      return bad("Invalid measurement id", undefined, 400);
    }

    const db = await getDb();
    const patientId = new ObjectId(caller.patientId);
    const existing = await requireEditableMeasurement(db, measurementId, patientId);
    if ("error" in existing) {
      return existing.error;
    }

    await db
      .collection(COLLECTIONS.MeasurementsLedger)
      .deleteOne({ _id: existing.measurement._id, patientId });

    return ok({ deleted: true, id: existing.measurement._id.toHexString() });
  } catch (err: any) {
    return bad(err?.message || "Unable to delete measurement", undefined, err?.status || 500);
  }
}
