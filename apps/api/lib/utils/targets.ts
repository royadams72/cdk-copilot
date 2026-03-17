import type { Db, Filter, ObjectId } from "mongodb";

import { COLLECTIONS } from "@ckd/core/server";
import type { NutrientKey } from "../types/dashboard";

type TargetBasis = "perDay" | "perKgPerDay" | null | undefined;

export type TargetDefinitionLike = {
  type?: "range" | "max" | "min" | "exact";
  basis?: TargetBasis;
  high?: number | null;
  low?: number | null;
  value?: number | null;
} | null;

export type TargetStateLike = {
  effective?: TargetDefinitionLike;
  metric?: string;
  override?: TargetDefinitionLike;
  recommended?: TargetDefinitionLike;
} | null;

type TargetsCurrentDoc = {
  patientId?: ObjectId | string;
  targets?: Record<string, TargetStateLike | number>;
};

type WeightDoc = {
  valueKg?: number;
};

type ClinicalDoc = {
  weightKg?: number | null;
};

function roundTargetNumber(value: number) {
  return Math.round(value);
}

export async function resolvePatientWeightKg(db: Db, patientId: ObjectId) {
  const latestWeight = await db
    .collection<WeightDoc>(COLLECTIONS.MeasurementsLedger)
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
    .collection<ClinicalDoc>(COLLECTIONS.UsersClinical)
    .findOne(
      { patientId },
      { projection: { _id: 0, weightKg: 1 }, sort: { updatedAt: -1 } },
    );
  if (typeof clinical?.weightKg === "number" && clinical.weightKg > 0) {
    return clinical.weightKg;
  }

  return null;
}

export function resolveTargetDefinitionForWeight(
  definition: TargetDefinitionLike,
  weightKg: number | null,
) {
  if (!definition) return definition;
  if (definition.basis !== "perKgPerDay" || !weightKg || weightKg <= 0) {
    return definition;
  }

  return {
    ...definition,
    basis: "perDay" as const,
    high:
      typeof definition.high === "number"
        ? roundTargetNumber(definition.high * weightKg)
        : (definition.high ?? null),
    low:
      typeof definition.low === "number"
        ? roundTargetNumber(definition.low * weightKg)
        : (definition.low ?? null),
    value:
      typeof definition.value === "number"
        ? roundTargetNumber(definition.value * weightKg)
        : (definition.value ?? null),
  };
}

export function resolveTargetStateForWeight(
  state: TargetStateLike,
  weightKg: number | null,
) {
  if (!state) return state;
  return {
    ...state,
    effective: resolveTargetDefinitionForWeight(
      state.effective ?? null,
      weightKg,
    ),
    override: resolveTargetDefinitionForWeight(
      state.override ?? null,
      weightKg,
    ),
    recommended: resolveTargetDefinitionForWeight(
      state.recommended ?? null,
      weightKg,
    ),
  };
}

function resolveTargetValue(
  state: TargetStateLike | number | null | undefined,
  weightKg: number | null,
): number | null {
  if (typeof state === "number" && Number.isFinite(state)) {
    return state;
  }
  if (!isTargetStateLike(state)) {
    return null;
  }
  const source = state.effective ?? state.override ?? state.recommended ?? null;
  if (source?.basis === "perKgPerDay" && (!weightKg || weightKg <= 0)) {
    return null;
  }
  const target = resolveTargetDefinitionForWeight(source, weightKg);
  if (!target) return null;

  if (typeof target.value === "number" && Number.isFinite(target.value)) {
    return target.value;
  }
  if (target.type === "range") {
    return typeof target.high === "number"
      ? target.high
      : typeof target.low === "number"
        ? target.low
        : null;
  }
  if (target.type === "max") {
    return typeof target.high === "number"
      ? target.high
      : typeof target.value === "number"
        ? target.value
        : null;
  }
  if (target.type === "min") {
    return typeof target.low === "number"
      ? target.low
      : typeof target.value === "number"
        ? target.value
        : null;
  }
  return null;
}

const TARGET_ALIASES: Record<NutrientKey, string[]> = {
  caloriesKcal: ["caloriesKcal", "calories_kcal_day", "energy_kcal_day"],
  phosphorusMg: ["phosphorusMg", "phosphorus_mg_day"],
  potassiumMg: ["potassiumMg", "potassium_mg_day"],
  proteinG: ["proteinG", "protein_g_day", "protein_g_kg_day"],
  sleep_duration_min_day: [],
  sodiumMg: ["sodiumMg", "sodium_mg_day"],
  steps_per_day: [],
  weight_kg: [],
};

function normaliseMetricKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isTargetStateLike(
  value: TargetStateLike | number | null | undefined,
): value is Exclude<TargetStateLike, null> {
  return !!value && typeof value === "object";
}

export function mapNutritionTargets(
  targetsCurrent: Record<string, TargetStateLike | number> | null | undefined,
  weightKg: number | null = null,
): Partial<Record<NutrientKey, number>> {
  const mapped: Partial<Record<NutrientKey, number>> = {};
  const entries = Object.entries(targetsCurrent ?? {});

  for (const nutrientKey of Object.keys(TARGET_ALIASES) as NutrientKey[]) {
    const aliases = TARGET_ALIASES[nutrientKey].map(normaliseMetricKey);
    const match = entries.find(([key, state]) => {
      const entryKey = normaliseMetricKey(key);
      if (aliases.includes(entryKey)) return true;
      if (
        isTargetStateLike(state) &&
        state !== null &&
        state.metric &&
        aliases.includes(normaliseMetricKey(state.metric))
      ) {
        return true;
      }
      return false;
    });
    if (!match) continue;
    const value = resolveTargetValue(match[1], weightKg);
    if (value !== null) mapped[nutrientKey] = value;
  }

  return mapped;
}

export async function getMappedNutritionTargets(db: Db, patientId: ObjectId) {
  const [targetsCurrentDoc, weightKg] = await Promise.all([
    findTargetsCurrentDoc(db, patientId),
    resolvePatientWeightKg(db, patientId),
  ]);

  return mapNutritionTargets(targetsCurrentDoc?.targets ?? null, weightKg);
}

async function findTargetsCurrentDoc(db: Db, patientId: ObjectId) {
  const collection = db.collection<TargetsCurrentDoc>(
    COLLECTIONS.TargetsCurrent,
  );

  const patientIdString = patientId.toString();
  const filters: Filter<TargetsCurrentDoc>[] = [
    { patientId, targets: { $exists: true, $type: "object" } },
    { patientId },
    { patientId: patientIdString, targets: { $exists: true, $type: "object" } },
    { patientId: patientIdString },
  ];

  for (const filter of filters) {
    const doc = await collection.findOne(filter, {
      projection: { targets: 1 },
      sort: { updatedAt: -1, _id: -1 },
    });

    if (doc) {
      return doc;
    }
  }

  return null;
}
