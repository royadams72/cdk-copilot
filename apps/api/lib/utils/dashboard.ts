import { COLLECTIONS } from "@/packages/core/dist/server";
import { Db, ObjectId } from "mongodb";
import {
  TRACKED_LABS,
  ZERO_TOTALS,
  RADIAL_METRICS,
  DAY_MS,
  FOOD_HIGHLIGHT_LIMIT,
  DEFAULT_RATIO_THRESHOLD,
} from "@/apps/api/app/api/dashboard/route";

import {
  NutritionEntryDoc,
  LabDoc,
  NutrientKey,
  NutritionDailyPoint,
  FoodHighlightResult,
  ChartMetricKey,
  FoodHighlight,
} from "../types/dashboard";

export async function fetchRecentLabs(db: Db, patientId: ObjectId) {
  return db
    .collection(COLLECTIONS.LabsLedger)
    .find(
      { patientId },
      {
        projection: {
          code: 1,
          name: 1,
          value: 1,
          unit: 1,
          takenAt: 1,
          createdAt: 1,
          abnormalFlag: 1,
        },
      }
    )
    .sort({ takenAt: -1, createdAt: -1 })
    .limit(200)
    .toArray();
}
export async function fetchNutritionEntries(db: Db, patientId: ObjectId) {
  return db
    .collection<NutritionEntryDoc>(COLLECTIONS.NutritionLedger)
    .find(
      { patientId },
      {
        projection: {
          totals: 1,
          items: 1,
          eatenAt: 1,
          createdAt: 1,
        },
      }
    )

    .sort({ eatenAt: -1, createdAt: -1 })
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
  return summary;
}

export function resolveLabConfig(doc: LabDoc) {
  const code = doc.code?.toLowerCase() ?? "";
  const name = doc.name?.toLowerCase() ?? "";
  return TRACKED_LABS.find(
    (config) =>
      (code && config.codes.some((c) => c.toLowerCase() === code)) ||
      (config.nameMatch && config.nameMatch.test(name))
  );
}

function formatLab(
  doc: LabDoc,
  config: (typeof TRACKED_LABS)[number]
): {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  takenAt: string | null;
  abnormalFlag: string | null;
} {
  const numericValue = normaliseNumber(doc.value);
  return {
    id: config.id,
    label: doc.name ?? config.label,
    value: numericValue,
    unit: doc.unit ?? config.unitFallback,
    takenAt: doc.takenAt ? doc.takenAt.toISOString() : null,
    abnormalFlag: doc.abnormalFlag ?? null,
  };
}

export function summarizeNutrition(
  entries: NutritionEntryDoc[],
  clinicalDoc: any,
  from: Date,
  to: Date,
  rangeDays: number
) {
  const totals = entries.reduce(
    (acc, entry) => {
      const entryTotals = extractNutrition(entry);
      for (const key of Object.keys(acc) as NutrientKey[]) {
        acc[key] += entryTotals[key];
      }
      return acc;
    },
    { ...ZERO_TOTALS }
  );

  const radials = RADIAL_METRICS.map((metric) => {
    const actual = round(totals[metric.key], metric.precision);
    const targetValue = normaliseNumber(clinicalDoc?.targets?.[metric.key]) as
      | number
      | null;
    const percent =
      targetValue && targetValue > 0 ? clamp(actual / targetValue, 0, 2) : null;

    return {
      id: metric.id,
      label: metric.label,
      unit: metric.unit,
      actual,
      target: targetValue,
      percent,
    };
  });

  const ratio = buildRatio(totals, clinicalDoc?.targets);
  const dailySeries = buildDailySeries(entries, to, rangeDays);
  const foodHighlights = buildFoodHighlights(entries);

  return {
    range: {
      from: from.toISOString(),
      to: to.toISOString(),
      days: rangeDays,
      entries: entries.length,
      lastEntryAt: entries[0]?.eatenAt
        ? entries[0].eatenAt!.toISOString()
        : entries[0]?.createdAt
        ? entries[0].createdAt!.toISOString()
        : null,
    },
    totals,
    radials,
    ratio,
    dailySeries,
    foodHighlights,
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
  source: Partial<Record<NutrientKey, number>>
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
  rangeDays: number
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
  entries: NutritionEntryDoc[]
): FoodHighlightResult {
  let latestEntryDate: Date | null = null;
  const bucketsByDay = new Map<
    string,
    Record<ChartMetricKey, FoodHighlight[]>
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
          name,
          amount: nutrientValue,
          unit: metric.unit,
          mealType: entry.mealType ?? null,
          eatenAt: eatenAtIso,
        });
      }
    }
  }

  const sortedByDay = Object.fromEntries(
    Array.from(bucketsByDay.entries()).map(([key, foods]) => [
      key,
      sortFoodHighlightBucket(foods),
    ])
  ) as Record<string, Record<ChartMetricKey, FoodHighlight[]>>;

  return {
    latestDate: latestEntryDate ? dayKey(latestEntryDate) : null,
    itemsByDate: sortedByDay,
  };
}

function initFoodHighlightBuckets() {
  const buckets = {} as Record<ChartMetricKey, FoodHighlight[]>;
  for (const metric of RADIAL_METRICS) {
    buckets[metric.key] = [];
  }
  return buckets;
}

function sortFoodHighlightBucket(
  bucket: Record<ChartMetricKey, FoodHighlight[]>
) {
  return Object.fromEntries(
    Object.entries(bucket).map(([key, foods]) => [
      key,
      foods.sort((a, b) => b.amount - a.amount).slice(0, FOOD_HIGHLIGHT_LIMIT),
    ])
  ) as Record<ChartMetricKey, FoodHighlight[]>;
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
  targets?: Record<string, number>
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
    value: actual,
    target,
    unit: "mg phosphorus per g protein",
    status,
  };
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
