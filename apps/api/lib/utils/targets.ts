import { randomUUID } from "crypto";
import type { Db, Filter, ObjectId } from "mongodb";

import { COLLECTIONS } from "../../../../packages/core/src/server/constants/collections";
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

export type StructuredTargetStateLike = Exclude<TargetStateLike, null> & {
  derivedFrom?: {
    matchedAt?: Date;
    ruleId: string;
    version: number;
  } | null;
  domain: "renal" | "lifestyle";
  overrideMeta?: {
    reason?: string | null;
    setAt: Date;
    setBy: {
      actorType: "user" | "clinician" | "system";
      displayName?: string | null;
      principalId: string;
    };
  } | null;
  unit: string;
};

export type TargetsCurrentDoc = {
  _id?: ObjectId;
  engine?: {
    computedAt: Date;
    ruleset: "clinical_reference_rules";
    runId: string;
  };
  flags?: string[];
  orgId?: string | null;
  patientId?: ObjectId | string;
  targets?: Record<string, TargetStateLike | number>;
  updatedAt?: Date;
  updatedBy?: {
    actorType: "user" | "clinician" | "system";
    displayName?: string | null;
    principalId: string;
  };
};

type WeightDoc = {
  valueKg?: number;
};

type ClinicalDoc = {
  weightKg?: number | null;
};

type TargetDefinitionValue = {
  basis?: "perDay" | "perKgPerDay" | null;
  high?: number | null;
  low?: number | null;
  type: "range" | "max" | "min" | "exact";
  value?: number | null;
};

type SeedTargetMetricState = {
  derivedFrom?: {
    matchedAt?: Date;
    ruleId: string;
    version: number;
  } | null;
  domain: "renal" | "lifestyle";
  effective: TargetDefinitionValue;
  metric: string;
  override?: TargetDefinitionValue | null;
  overrideMeta?: {
    reason?: string | null;
    setAt: Date;
    setBy: {
      actorType: "user" | "clinician" | "system";
      displayName?: string | null;
      principalId: string;
    };
  } | null;
  recommended: TargetDefinitionValue;
  unit: string;
};

const DEFAULT_TARGET_BLUEPRINTS: Array<{
  definition: TargetDefinitionValue;
  derivedFrom: { ruleId: string; version: number };
  domain: "renal" | "lifestyle";
  metric: string;
  unit: string;
}> = [
  {
    definition: { basis: "perDay", type: "min", value: 8000 },
    derivedFrom: { ruleId: "steps-per-day-adults-under-60", version: 1 },
    domain: "lifestyle",
    metric: "steps_per_day",
    unit: "steps/day",
  },
  {
    definition: { basis: "perDay", high: 540, low: 420, type: "range", value: null },
    derivedFrom: { ruleId: "sleep-duration-adults-18-64", version: 1 },
    domain: "lifestyle",
    metric: "sleep_duration_min_day",
    unit: "min/day",
  },
  {
    definition: { basis: null, high: 74, low: 68, type: "range", value: null },
    derivedFrom: { ruleId: "weight-maintenance-adult-default", version: 1 },
    domain: "lifestyle",
    metric: "weight_kg",
    unit: "kg",
  },
  {
    definition: { basis: "perKgPerDay", type: "max", value: 0.8 },
    derivedFrom: { ruleId: "renal-protein-default-nondialysis", version: 1 },
    domain: "renal",
    metric: "proteinG",
    unit: "g/day",
  },
  {
    definition: { basis: "perDay", type: "max", value: 800 },
    derivedFrom: { ruleId: "renal-phosphorus-default", version: 1 },
    domain: "renal",
    metric: "phosphorusMg",
    unit: "mg/day",
  },
  {
    definition: { basis: "perDay", type: "max", value: 2000 },
    derivedFrom: { ruleId: "renal-potassium-default", version: 1 },
    domain: "renal",
    metric: "potassiumMg",
    unit: "mg/day",
  },
  {
    definition: { basis: "perDay", type: "max", value: 2000 },
    derivedFrom: { ruleId: "renal-sodium-default", version: 1 },
    domain: "renal",
    metric: "sodiumMg",
    unit: "mg/day",
  },
  {
    definition: { basis: "perKgPerDay", high: 35, low: 25, type: "range", value: null },
    derivedFrom: { ruleId: "renal-energy-default", version: 1 },
    domain: "renal",
    metric: "caloriesKcal",
    unit: "kcal/day",
  },
];

function cloneDefinition(definition: TargetDefinitionValue): TargetDefinitionValue {
  return JSON.parse(JSON.stringify(definition)) as TargetDefinitionValue;
}

function isDuplicateKeyError(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export function buildDefaultTargetStates(now = new Date()) {
  return Object.fromEntries(
    DEFAULT_TARGET_BLUEPRINTS.map((item) => {
      const recommended = cloneDefinition(item.definition);
      return [
        item.metric,
        {
          derivedFrom: {
            matchedAt: now,
            ruleId: item.derivedFrom.ruleId,
            version: item.derivedFrom.version,
          },
          domain: item.domain,
          effective: cloneDefinition(recommended),
          metric: item.metric,
          override: null,
          overrideMeta: null,
          recommended,
          unit: item.unit,
        } satisfies SeedTargetMetricState,
      ];
    }),
  ) as Record<string, SeedTargetMetricState>;
}

export async function ensurePatientTargetsSeeded(
  db: Db,
  input: {
    orgId?: string | null;
    patientId: ObjectId;
    seedPrincipalId?: string | null;
  },
) {
  const existing = await findTargetsCurrentDoc(db, input.patientId);
  if (existing?.targets && Object.keys(existing.targets).length > 0) {
    return existing;
  }

  const now = new Date();
  const actor = {
    actorType: "system" as const,
    displayName: "Target seeder",
    principalId: input.seedPrincipalId?.trim() || "system:target-seeder",
  };
  const orgId = input.orgId ?? "org_demo";
  const runId = `seed-targets-${now.toISOString()}-${randomUUID().slice(0, 8)}`;
  const targets = buildDefaultTargetStates(now);

  const currentCollection = db.collection<TargetsCurrentDoc>(
    COLLECTIONS.TargetsCurrent,
  );
  const ledgerCollection = db.collection(COLLECTIONS.TargetsLedger);

  const currentPayload = {
    engine: {
      computedAt: now,
      ruleset: "clinical_reference_rules" as const,
      runId,
    },
    flags: ["seeded"],
    orgId,
    targets,
    updatedAt: now,
    updatedBy: actor,
  };

  if (existing?._id) {
    await currentCollection.updateOne({ _id: existing._id }, { $set: currentPayload });
  } else {
    await currentCollection.updateOne(
      { patientId: input.patientId },
      {
        $set: currentPayload,
        $setOnInsert: { patientId: input.patientId },
      },
      { upsert: true },
    );
  }

  try {
    await ledgerCollection.insertMany(
      Object.values(targets).map((target) => ({
        after: target.effective,
        before: null,
        createdAt: now,
        createdBy: actor,
        derivedFrom: target.derivedFrom ?? null,
        domain: target.domain,
        eventType: "system_recommended_target",
        idemKey: `seed:${input.patientId.toHexString()}:${target.metric}:v${target.derivedFrom?.version ?? 1}`,
        metric: target.metric,
        orgId,
        patientId: input.patientId,
        reason:
          target.domain === "lifestyle"
            ? "Seeded initial lifestyle targets"
            : "Seeded initial renal targets",
        superseded: false,
      })),
      { ordered: false },
    );
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }

  return findTargetsCurrentDoc(db, input.patientId);
}

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

export function resolveTargetValue(
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

export function isStructuredTargetState(
  value: TargetStateLike | number | null | undefined,
): value is StructuredTargetStateLike {
  return (
    isTargetStateLike(value) &&
    (value as Partial<StructuredTargetStateLike>).domain !== undefined &&
    typeof (value as Partial<StructuredTargetStateLike>).unit === "string"
  );
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

export async function getMappedNutritionTargets(
  db: Db,
  patientId: ObjectId,
  seedInput?: {
    orgId?: string | null;
    seedPrincipalId?: string | null;
  },
) {
  if (seedInput) {
    await ensurePatientTargetsSeeded(db, {
      orgId: seedInput.orgId,
      patientId,
      seedPrincipalId: seedInput.seedPrincipalId,
    });
  }

  const [targetsCurrentDoc, weightKg] = await Promise.all([
    findTargetsCurrentDoc(db, patientId),
    resolvePatientWeightKg(db, patientId),
  ]);

  return mapNutritionTargets(targetsCurrentDoc?.targets ?? null, weightKg);
}

export async function findTargetsCurrentDoc(db: Db, patientId: ObjectId) {
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
