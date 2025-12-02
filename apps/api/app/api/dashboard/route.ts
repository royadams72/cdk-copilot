import { NextRequest } from "next/server";
import { ObjectId, type Db } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { ok, bad } from "@/apps/api/lib/http/responses";
import { ROLES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

export const runtime = "nodejs";

type LabDoc = {
  _id: ObjectId;
  code?: string;
  name?: string;
  value?: number | string;
  unit?: string;
  takenAt?: Date;
  createdAt?: Date;
  abnormalFlag?: string;
};

type NutritionEntry = {
  at?: Date;
  createdAt?: Date;
  mealType?: string;
  totals?: Partial<Record<NutrientKey, number>>;
  items?: Array<{
    description?: string;
    nutrients?: Partial<Record<NutrientKey, number>>;
  }>;
};

type ClinicalDoc = {
  ckdStage?: string | null;
  egfrCurrent?: number | string | null;
  dialysisStatus?: string | null;
  lastClinicalUpdateAt?: Date | null;
  targets?: Partial<Record<NutrientKey | "fluidMl", number>>;
};

const RANGE_DAYS = 7;
const DEFAULT_RATIO_THRESHOLD = 12; // mg phosphorus per gram of protein
const TRACKED_LABS = [
  {
    id: "egfr",
    label: "eGFR",
    codes: ["33914-3"],
    nameMatch: /egfr/i,
    unitFallback: "mL/min/1.73m²",
  },
  {
    id: "phosphorus",
    label: "Serum phosphorus",
    codes: ["2777-1", "2778-9"],
    nameMatch: /phosph/,
    unitFallback: "mg/dL",
  },
  {
    id: "potassium",
    label: "Serum potassium",
    codes: ["2823-3"],
    nameMatch: /potass/,
    unitFallback: "mmol/L",
  },
] as const;

const RADIAL_METRICS = [
  { id: "protein", label: "Protein", key: "proteinG", unit: "g", precision: 1 },
  {
    id: "phosphorus",
    label: "Phosphorus",
    key: "phosphorusMg",
    unit: "mg",
    precision: 0,
  },
  {
    id: "potassium",
    label: "Potassium",
    key: "potassiumMg",
    unit: "mg",
    precision: 0,
  },
  {
    id: "sodium",
    label: "Sodium",
    key: "sodiumMg",
    unit: "mg",
    precision: 0,
  },
] as const;

type ChartMetric = (typeof RADIAL_METRICS)[number];
type ChartMetricKey = ChartMetric["key"];

type NutritionDailyPoint = {
  date: string;
  label: string;
  totals: Record<NutrientKey, number>;
};

type FoodHighlight = {
  name: string;
  amount: number;
  unit: string;
  mealType: string | null;
  eatenAt: string | null;
};

type FoodHighlightResult = {
  date: string | null;
  items: Record<ChartMetricKey, FoodHighlight[]>;
};

type NutrientKey =
  | "caloriesKcal"
  | "proteinG"
  | "phosphorusMg"
  | "potassiumMg"
  | "sodiumMg";

const ZERO_TOTALS: Record<NutrientKey, number> = {
  caloriesKcal: 0,
  proteinG: 0,
  phosphorusMg: 0,
  potassiumMg: 0,
  sodiumMg: 0,
};
const DAY_MS = 24 * 60 * 60 * 1000;
const FOOD_HIGHLIGHT_LIMIT = 5;

export async function GET(req: NextRequest) {
  try {
    // Patients only have the default auth scopes, so rely on role + patient context.
    const caller = await requireUser(req);

    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }

    const db = await getDb();
    const patientObjectId = new ObjectId(caller.patientId);
    // TODO: Take todays readings, not dates
    const rangeEnd = new Date();
    const rangeStart = new Date(
      rangeEnd.getTime() - RANGE_DAYS * 24 * 60 * 60 * 1000
    );

    const [clinicalDoc, labDocs, nutritionDocs] = await Promise.all([
      db.collection<ClinicalDoc>(COLLECTIONS.UsersClinical).findOne(
        { patientId: patientObjectId },
        {
          projection: {
            ckdStage: 1,
            egfrCurrent: 1,
            dialysisStatus: 1,
            lastClinicalUpdateAt: 1,
            targets: 1,
          },
        }
      ),
      fetchRecentLabs(db, patientObjectId),
      fetchNutritionEntries(db, patientObjectId, rangeStart, rangeEnd),
    ]);

    const labs = summarizeLabs(labDocs);
    const nutrition = summarizeNutrition(
      nutritionDocs,
      clinicalDoc,
      rangeStart,
      rangeEnd
    );

    return ok({
      patientId: caller.patientId,
      summary: {
        ckdStage: clinicalDoc?.ckdStage ?? null,
        egfrCurrent: normaliseNumber(clinicalDoc?.egfrCurrent),
        dialysisStatus: clinicalDoc?.dialysisStatus ?? null,
        lastClinicalUpdateAt: clinicalDoc?.lastClinicalUpdateAt
          ? clinicalDoc.lastClinicalUpdateAt.toISOString()
          : null,
      },
      labs,
      nutrition,
    });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}

async function fetchRecentLabs(db: Db, patientId: ObjectId) {
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

async function fetchNutritionEntries(
  db: Db,
  patientId: ObjectId,
  from: Date,
  to: Date
) {
  return db
    .collection<NutritionEntry>(COLLECTIONS.NutritionLedger)
    .find(
      { patientId, at: { $gte: from, $lte: to } },
      {
        projection: {
          totals: 1,
          items: 1,
          at: 1,
          createdAt: 1,
        },
      }
    )
    .sort({ at: -1, createdAt: -1 })
    .limit(200)
    .toArray();
}

function summarizeLabs(labs: LabDoc[]) {
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

function resolveLabConfig(doc: LabDoc) {
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

function summarizeNutrition(
  entries: NutritionEntry[],
  clinicalDoc: any,
  from: Date,
  to: Date
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
  const dailySeries = buildDailySeries(entries, to);
  const foodHighlights = buildFoodHighlights(entries);

  return {
    range: {
      from: from.toISOString(),
      to: to.toISOString(),
      days: RANGE_DAYS,
      entries: entries.length,
      lastEntryAt: entries[0]?.at
        ? entries[0].at!.toISOString()
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

function extractNutrition(entry: NutritionEntry) {
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
  entries: NutritionEntry[],
  rangeEnd: Date
): NutritionDailyPoint[] {
  const endDay = startOfDay(rangeEnd);
  const startDay = new Date(endDay.getTime() - (RANGE_DAYS - 1) * DAY_MS);
  const buckets = new Map<string, Record<NutrientKey, number>>();

  for (let i = 0; i < RANGE_DAYS; i++) {
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

function buildFoodHighlights(entries: NutritionEntry[]): FoodHighlightResult {
  const latestEntryDate = entries.reduce<Date | null>((acc, entry) => {
    const entryDate = resolveEntryDate(entry);
    if (!entryDate) return acc;
    if (!acc || entryDate > acc) {
      return entryDate;
    }
    return acc;
  }, null);

  const buckets = initFoodHighlightBuckets();
  if (!latestEntryDate) {
    return { date: null, items: buckets };
  }

  const targetDayKey = dayKey(latestEntryDate);
  for (const entry of entries) {
    const entryDate = resolveEntryDate(entry);
    if (!entryDate || dayKey(entryDate) !== targetDayKey) continue;
    const eatenAtIso = entry.at
      ? entry.at.toISOString()
      : entry.createdAt
      ? entry.createdAt.toISOString()
      : null;

    for (const item of entry.items ?? []) {
      const name = item.description?.trim() || "Logged meal";
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

  const sorted = Object.fromEntries(
    Object.entries(buckets).map(([key, foods]) => [
      key,
      foods
        .sort((a, b) => b.amount - a.amount)
        .slice(0, FOOD_HIGHLIGHT_LIMIT),
    ])
  ) as Record<ChartMetricKey, FoodHighlight[]>;

  return {
    date: targetDayKey,
    items: sorted,
  };
}

function initFoodHighlightBuckets() {
  const buckets = {} as Record<ChartMetricKey, FoodHighlight[]>;
  for (const metric of RADIAL_METRICS) {
    buckets[metric.key] = [];
  }
  return buckets;
}

function resolveEntryDate(entry: NutritionEntry) {
  return entry.at ?? entry.createdAt ?? null;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
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

function normaliseNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
