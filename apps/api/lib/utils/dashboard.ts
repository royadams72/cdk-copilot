import { COLLECTIONS } from "@/packages/core/dist/server";
import { Db, ObjectId } from "mongodb";
import {
  DAY_MS,
  DEFAULT_RATIO_THRESHOLD,
  FOOD_HIGHLIGHT_LIMIT,
  RADIAL_METRICS,
  TRACKED_LABS,
  ZERO_TOTALS,
} from "@/apps/api/app/api/dashboard/route";

import {
  ChartMetricKey,
  FoodHighlight,
  FoodHighlightMetricKey,
  FoodHighlightResult,
  LabDoc,
  NutrientKey,
  NutritionDailyPoint,
  NutritionEntryDoc,
  NutritionMealEntry,
} from "../types/dashboard";
import type { MedicationCurrentDoc } from "../types/dashboard";

type ReferenceRangeDoc = {
  code?: string;
  kind?: "lab_range";
  label?: string;
  orgId?: string | null;
  priority?: number;
  rule?: {
    range?: {
      criticalHigh?: number | null;
      criticalLow?: number | null;
      lower?: number | null;
      upper?: number | null;
    };
  };
  status?: "active" | "deprecated" | "disabled";
  ageMax?: number;
  ageMin?: number;
  sex?: "male" | "female" | "any";
  unit?: string;
};

function normalizeUnit(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .replace(/µ/g, "u")
    .replace(/\s+/g, "");
}

function hasRefRange(doc: LabDoc) {
  return (
    typeof doc.refRange?.low === "number" ||
    typeof doc.refRange?.high === "number" ||
    !!doc.refRange?.text
  );
}

async function hydrateRefRanges(db: Db, docs: LabDoc[]) {
  const needs = docs.filter(
    (doc) => !hasRefRange(doc) && !!doc.code && !!doc.unit,
  );
  if (needs.length === 0) return docs;

  const codes = Array.from(
    new Set(needs.map((doc) => doc.code).filter((v): v is string => !!v)),
  );
  if (codes.length === 0) return docs;

  const refs = await db
    .collection<ReferenceRangeDoc>("clinical_reference_rules")
    .find(
      { kind: "lab_range", status: "active", code: { $in: codes } },
      {
        projection: {
          _id: 0,
          ageMax: 1,
          ageMin: 1,
          code: 1,
          orgId: 1,
          priority: 1,
          rule: 1,
          sex: 1,
          unit: 1,
        },
      },
    )
    .toArray();

  const byCode = new Map<string, ReferenceRangeDoc[]>();
  for (const ref of refs) {
    const code = ref.code;
    if (!code) continue;
    const list = byCode.get(code) ?? [];
    list.push(ref);
    byCode.set(code, list);
  }

  const assumedAge = 18;
  return docs.map((doc) => {
    if (hasRefRange(doc) || !doc.code || !doc.unit) return doc;

    const candidates = byCode.get(doc.code) ?? [];
    if (!candidates.length) return doc;

    const unitNorm = normalizeUnit(doc.unit);
    const match =
      candidates.find((ref) => {
        if (normalizeUnit(ref.unit) !== unitNorm) return false;
        const sexOk = !ref.sex || ref.sex === "any";
        const ageMin = typeof ref.ageMin === "number" ? ref.ageMin : 0;
        const ageMax = typeof ref.ageMax === "number" ? ref.ageMax : 200;
        return sexOk && assumedAge >= ageMin && assumedAge <= ageMax;
      }) ??
      candidates.find((ref) => normalizeUnit(ref.unit) === unitNorm);

    if (!match) return doc;
    const lower = typeof match.rule?.range?.lower === "number" ? match.rule.range.lower : null;
    const upper = typeof match.rule?.range?.upper === "number" ? match.rule.range.upper : null;
    return {
      ...doc,
      refRange: {
        high: upper,
        low: lower,
        text:
          typeof lower === "number" || typeof upper === "number"
            ? null
            : null,
      },
    };
  });
}

export async function fetchRecentLabs(db: Db, patientId: ObjectId) {
  const current = await db
    .collection<LabDoc>(COLLECTIONS.LabsCurrent)
    .find(
      { patientId },
      {
        projection: {
          abnormalFlag: 1,
          code: 1,
          derivedAbnormalFlag: 1,
          effectiveAbnormalFlag: 1,
          name: 1,
          refRange: 1,
          reportedAt: 1,
          sourceAbnormalFlag: 1,
          takenAt: 1,
          unit: 1,
          value: 1,
        },
      },
    )
    .sort({ takenAt: -1, reportedAt: -1, updatedAt: -1 })
    .limit(200)
    .toArray();
  if (current.length > 0) {
    return hydrateRefRanges(db, current);
  }

  const ledger = await db
    .collection<LabDoc>(COLLECTIONS.LabsLedger)
    .find(
      { patientId },
      {
        projection: {
          abnormalFlag: 1,
          code: 1,
          createdAt: 1,
          derivedAbnormalFlag: 1,
          effectiveAbnormalFlag: 1,
          name: 1,
          refRange: 1,
          reportedAt: 1,
          sourceAbnormalFlag: 1,
          takenAt: 1,
          unit: 1,
          value: 1,
        },
      },
    )
    .sort({ createdAt: -1, takenAt: -1 })
    .limit(200)
    .toArray();
  return hydrateRefRanges(db, ledger);
}
export async function fetchNutritionEntries(db: Db, patientId: ObjectId) {
  return db
    .collection<NutritionEntryDoc>(COLLECTIONS.NutritionLedger)
    .find(
      { patientId },
      {
        projection: {
          _id: 1,
          createdAt: 1,
          eatenAt: 1,
          items: 1,
          mealType: 1,
          totals: 1,
        },
      },
    )

    .sort({ createdAt: -1, eatenAt: -1 })
    .limit(200)
    .toArray();
}

export async function fetchRecentMedications(db: Db, patientId: ObjectId) {
  return db
    .collection<MedicationCurrentDoc>(COLLECTIONS.MedicationsCurrent)
    .find(
      { patientId },
      {
        projection: {
          _id: 1,
          medicationId: 1,
          dose: 1,
          form: 1,
          frequency: 1,
          name: 1,
          route: 1,
          startAt: 1,
          status: 1,
          updatedAt: 1,
        },
      },
    )
    .sort({ updatedAt: -1, startAt: -1 })
    .limit(200)
    .toArray();
}

export function summarizeLabs(labs: LabDoc[]) {
  const latestById: Record<string, ReturnType<typeof formatLab> | null> = {};

  for (const doc of labs) {
    const config = resolveLabConfig(doc);
    if (!config || latestById[config.id]) continue;
    latestById[config.id] = formatLab(doc, config);
  }

  const summary: Record<string, ReturnType<typeof formatLab> | null> = {};
  for (const config of TRACKED_LABS) {
    summary[config.id] = latestById[config.id] ?? null;
  }
  const recent = labs
    .slice()
    .sort((a, b) => {
      const aTime = a.takenAt?.getTime() ?? 0;
      const bTime = b.takenAt?.getTime() ?? 0;
      return bTime - aTime;
    })
    .slice(0, 3)
    .map((doc) => formatLab(doc, resolveLabConfig(doc)));

  return { recent, tracked: summary };
}

export function resolveLabConfig(doc: LabDoc) {
  const code = doc.code?.toLowerCase() ?? "";
  const name = doc.name?.toLowerCase() ?? "";
  return TRACKED_LABS.find(
    (config) =>
      (code && config.codes.some((c) => c.toLowerCase() === code)) ||
      (config.nameMatch && config.nameMatch.test(name)),
  );
}

export function summarizeMedications(medications: MedicationCurrentDoc[]) {
  const active = medications.filter((med) => med.status === "active");
  const recent = active.slice(0, 3).map((med) => ({
    id: (med.medicationId ?? med._id).toString(),
    dose: med.dose ?? null,
    form: med.form ?? null,
    frequency: med.frequency ?? null,
    name: med.name ?? "Medication",
    route: med.route ?? null,
    startAt: med.startAt ? med.startAt.toISOString() : null,
    status: "active" as const,
  }));

  return {
    activeCount: active.length,
    recent,
    totalCount: medications.length,
  };
}

function formatLab(
  doc: LabDoc,
  config?: (typeof TRACKED_LABS)[number],
): {
  code: string;
  id: string;
  abnormalFlag: string | null;
  label: string;
  refRange: { low: number | null; high: number | null; text: string | null };
  takenAt: string | null;
  unit: string;
  value: number | null;
} {
  const numericValue = normaliseNumber(doc.value);
  const effectiveFlag =
    doc.effectiveAbnormalFlag ??
    doc.sourceAbnormalFlag ??
    doc.derivedAbnormalFlag ??
    null;
  return {
    code: doc.code ?? "",
    id: config?.id ?? (doc.code ?? doc.name ?? "lab"),
    abnormalFlag: effectiveFlag,
    label: doc.name ?? config?.label ?? "Lab",
    refRange: {
      low: normaliseNumber(doc.refRange?.low),
      high: normaliseNumber(doc.refRange?.high),
      text: doc.refRange?.text ?? null,
    },
    takenAt: doc.takenAt ? doc.takenAt.toISOString() : null,
    unit: doc.unit ?? config?.unitFallback ?? "",
    value: numericValue,
  };
}

export function summarizeNutrition(
  entries: NutritionEntryDoc[],
  nutritionTargets: Partial<Record<NutrientKey, number>>,
  from: Date,
  to: Date,
  rangeDays: number,
) {
  const rangeStart = startOfDay(from);
  const rangeEndExclusive = new Date(startOfDay(to).getTime() + DAY_MS);
  const entriesInRange = entries.filter((entry) => {
    const entryDate = resolveEntryDate(entry);
    if (!entryDate) return false;
    return entryDate >= rangeStart && entryDate < rangeEndExclusive;
  });

  const totals = entriesInRange.reduce(
    (acc, entry) => {
      const entryTotals = extractNutrition(entry);
      for (const key of Object.keys(acc) as NutrientKey[]) {
        acc[key] += entryTotals[key];
      }
      return acc;
    },
    { ...ZERO_TOTALS },
  );

  const radials = RADIAL_METRICS.map((metric) => {
    const actual = round(totals[metric.key], metric.precision);
    const targetValue = normaliseNumber(nutritionTargets?.[metric.key]) as
      | number
      | null;
    const percent =
      targetValue && targetValue > 0 ? clamp(actual / targetValue, 0, 2) : null;

    return {
      id: metric.id,
      actual,
      label: metric.label,
      percent,
      target: targetValue,
      unit: metric.unit,
    };
  });

  const ratio = buildRatio(totals, nutritionTargets);
  const dailySeries = buildDailySeries(entriesInRange, to, rangeDays);
  const foodHighlights = buildFoodHighlights(entriesInRange);
  const mealsByDate = buildMealsByDate(entriesInRange);

  return {
    dailySeries,
    foodHighlights,
    mealsByDate,
    radials,
    range: {
      from: from.toISOString(),
      to: to.toISOString(),
      days: rangeDays,
      entries: entriesInRange.length,
      lastEntryAt: entriesInRange[0]?.eatenAt
        ? entriesInRange[0].eatenAt!.toISOString()
        : entriesInRange[0]?.createdAt
          ? entriesInRange[0].createdAt!.toISOString()
          : null,
    },
    ratio,
    totals,
  };
}

function extractNutrition(entry: NutritionEntryDoc) {
  const totals = { ...ZERO_TOTALS };

  if (entry.totals) {
    mergeNutrients(totals, entry.totals);
  }
  if (Array.isArray(entry.items)) {
    for (const item of entry.items) {
      if (item?.nutrients) {
        mergeNutrients(totals, item.nutrients);
      }
    }
  }
  return totals;
}

function mergeNutrients(
  target: Record<NutrientKey, number>,
  source: Partial<Record<NutrientKey, number>>,
) {
  for (const key of Object.keys(target) as NutrientKey[]) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      target[key] += value;
    }
  }
}

function buildDailySeries(
  entries: NutritionEntryDoc[],
  rangeEnd: Date,
  rangeDays: number,
): NutritionDailyPoint[] {
  const endDay = startOfDay(rangeEnd);
  const startDay = new Date(endDay.getTime() - (rangeDays - 1) * DAY_MS);
  const buckets = new Map<string, Record<NutrientKey, number>>();

  for (let i = 0; i < rangeDays; i++) {
    const day = new Date(startDay.getTime() + i * DAY_MS);
    buckets.set(dayKey(day), { ...ZERO_TOTALS });
  }

  for (const entry of entries) {
    const entryDate = resolveEntryDate(entry);
    if (!entryDate) continue;
    const bucketKey = dayKey(entryDate);
    if (!buckets.has(bucketKey)) continue;
    const entryTotals = extractNutrition(entry);
    const bucket = buckets.get(bucketKey)!;
    for (const key of Object.keys(bucket) as NutrientKey[]) {
      bucket[key] += entryTotals[key];
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, totals]) => ({
      date: key,
      label: formatWeekdayLabel(new Date(key)),
      totals,
    }));
}

function buildFoodHighlights(
  entries: NutritionEntryDoc[],
): FoodHighlightResult {
  let latestEntryDate: Date | null = null;
  const bucketsByDay = new Map<
    string,
    Record<FoodHighlightMetricKey, FoodHighlight[]>
  >();

  for (const entry of entries) {
    const entryDate = resolveEntryDate(entry);
    if (!entryDate) continue;

    if (!latestEntryDate || entryDate > latestEntryDate) {
      latestEntryDate = entryDate;
    }

    const bucketKey = dayKey(entryDate);
    if (!bucketsByDay.has(bucketKey)) {
      bucketsByDay.set(bucketKey, initFoodHighlightBuckets());
    }

    const eatenAtIso = entry.eatenAt
      ? entry.eatenAt.toISOString()
      : entry.createdAt
        ? entry.createdAt.toISOString()
        : null;

    const buckets = bucketsByDay.get(bucketKey)!;
    for (const item of entry.items ?? []) {
      const name = item.name?.trim() || "Logged meal";
      for (const metric of RADIAL_METRICS) {
        const nutrientValue = normaliseNumber(item.nutrients?.[metric.key]);
        if (!nutrientValue || nutrientValue <= 0) continue;
        buckets[metric.key as ChartMetricKey].push({
          amount: nutrientValue,
          eatenAt: eatenAtIso,
          mealType: entry.mealType ?? null,
          name,
          unit: metric.unit,
        });
      }

      const phosphorus = normaliseNumber(item.nutrients?.phosphorusMg);
      const protein = normaliseNumber(item.nutrients?.proteinG);
      const ratio = normaliseNumber(item.nutrients?.phosphorus_protein_ratio);
      const resolvedRatio =
        ratio ??
        (phosphorus && protein && protein > 0 ? phosphorus / protein : null);
      if (resolvedRatio && resolvedRatio > 0) {
        buckets.phosphorus_protein_ratio.push({
          amount: resolvedRatio,
          eatenAt: eatenAtIso,
          mealType: entry.mealType ?? null,
          name,
          unit: "mg/g",
        });
      }
    }
  }

  const sortedByDay = Object.fromEntries(
    Array.from(bucketsByDay.entries()).map(([key, foods]) => [
      key,
      sortFoodHighlightBucket(foods),
    ]),
  ) as Record<string, Record<FoodHighlightMetricKey, FoodHighlight[]>>;

  return {
    itemsByDate: sortedByDay,
    latestDate: latestEntryDate ? dayKey(latestEntryDate) : null,
  };
}

function buildMealsByDate(
  entries: NutritionEntryDoc[],
): Record<string, NutritionMealEntry[]> {
  const buckets = new Map<string, NutritionMealEntry[]>();

  for (const entry of entries) {
    const entryDate = resolveEntryDate(entry);
    if (!entryDate) continue;
    const bucketKey = dayKey(entryDate);
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, []);
    }
    const eatenAtIso = entry.eatenAt
      ? entry.eatenAt.toISOString()
      : entry.createdAt
        ? entry.createdAt.toISOString()
        : null;
    buckets.get(bucketKey)!.push({
      id: entry._id.toString(),
      eatenAt: eatenAtIso,
      items: entry.items ?? [],
      mealType: entry.mealType ?? "snack",
    });
  }

  return Object.fromEntries(
    Array.from(buckets.entries()).map(([key, items]) => [
      key,
      items.sort((a, b) => {
        const aTime = a.eatenAt ? Date.parse(a.eatenAt) : 0;
        const bTime = b.eatenAt ? Date.parse(b.eatenAt) : 0;
        return bTime - aTime;
      }),
    ]),
  );
}

function initFoodHighlightBuckets() {
  const buckets = {} as Record<FoodHighlightMetricKey, FoodHighlight[]>;
  for (const metric of RADIAL_METRICS) {
    buckets[metric.key] = [];
  }
  buckets.phosphorus_protein_ratio = [];
  return buckets;
}

function sortFoodHighlightBucket(
  bucket: Record<FoodHighlightMetricKey, FoodHighlight[]>,
) {
  return Object.fromEntries(
    Object.entries(bucket).map(([key, foods]) => [
      key,
      foods.sort((a, b) => b.amount - a.amount).slice(0, FOOD_HIGHLIGHT_LIMIT),
    ]),
  ) as Record<FoodHighlightMetricKey, FoodHighlight[]>;
}

function resolveEntryDate(entry: NutritionEntryDoc) {
  return entry.eatenAt ?? entry.createdAt ?? null;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

const WEEKDAY_LABELS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;
function formatWeekdayLabel(date: Date) {
  return WEEKDAY_LABELS[date.getDay()];
}

function dayKey(date: Date) {
  return startOfDay(date).toISOString();
}

function buildRatio(
  totals: Record<NutrientKey, number>,
  targets?: Partial<Record<NutrientKey, number>>,
) {
  const actual =
    totals.proteinG > 0
      ? round(totals.phosphorusMg / totals.proteinG, 2)
      : null;

  const targetDerived =
    targets?.proteinG && targets?.phosphorusMg
      ? targets.phosphorusMg / targets.proteinG
      : DEFAULT_RATIO_THRESHOLD;

  const target = round(targetDerived, 2);
  let status: "in-range" | "high" | "unknown" = "unknown";
  if (actual !== null && Number.isFinite(target)) {
    status = actual <= target ? "in-range" : "high";
  }

  return {
    status,
    target,
    unit: "mg phosphorus per g protein",
    value: actual,
  };
}

type TargetStateLike = {
  metric?: string;
  recommended?: {
    type?: "range" | "max" | "min" | "exact";
    low?: number | null;
    high?: number | null;
    value?: number | null;
  } | null;
  override?: {
    type?: "range" | "max" | "min" | "exact";
    low?: number | null;
    high?: number | null;
    value?: number | null;
  } | null;
  effective?: {
    type?: "range" | "max" | "min" | "exact";
    low?: number | null;
    high?: number | null;
    value?: number | null;
  } | null;
};

function resolveTargetValue(state?: TargetStateLike | null): number | null {
  const target = state?.effective ?? state?.override ?? state?.recommended;
  if (!target) return null;
  const direct = normaliseNumber(target.value);
  if (direct !== null) return direct;

  if (target.type === "range") {
    return normaliseNumber(target.high ?? target.low);
  }
  if (target.type === "max") return normaliseNumber(target.high ?? target.value);
  if (target.type === "min") return normaliseNumber(target.low ?? target.value);
  return null;
}

const TARGET_ALIASES: Record<NutrientKey, string[]> = {
  caloriesKcal: ["caloriesKcal", "calories_kcal_day", "energy_kcal_day"],
  phosphorusMg: ["phosphorusMg", "phosphorus_mg_day"],
  potassiumMg: ["potassiumMg", "potassium_mg_day"],
  proteinG: ["proteinG", "protein_g_day", "protein_g_kg_day"],
  sodiumMg: ["sodiumMg", "sodium_mg_day"],
};

function normaliseMetricKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function mapNutritionTargets(
  targetsCurrent:
    | Record<string, TargetStateLike>
    | null
    | undefined,
): Partial<Record<NutrientKey, number>> {
  const mapped: Partial<Record<NutrientKey, number>> = {};
  const entries = Object.entries(targetsCurrent ?? {});

  for (const nutrientKey of Object.keys(TARGET_ALIASES) as NutrientKey[]) {
    const aliases = TARGET_ALIASES[nutrientKey].map(normaliseMetricKey);
    const match = entries.find(([key, state]) => {
      const entryKey = normaliseMetricKey(key);
      if (aliases.includes(entryKey)) return true;
      if (state?.metric && aliases.includes(normaliseMetricKey(state.metric)))
        return true;
      return false;
    });
    if (!match) continue;
    const value = resolveTargetValue(match[1]);
    if (value !== null) mapped[nutrientKey] = value;
  }

  return mapped;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, decimals = 1) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function normaliseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
