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
  totals?: Partial<Record<NutrientKey, number>>;
  items?: Array<{ nutrients?: Partial<Record<NutrientKey, number>> }>;
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
] as const;

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

export async function GET(req: NextRequest) {
  try {
    // Patients only have the default auth scopes, so rely on role + patient context.
    const caller = await requireUser(req);
    console.log("caller::", caller);

    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }

    return ok({
      patientId: caller.patientId,
      message: "Dashboard endpoint is live.",
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}

async function fetchRecentLabs(db: Db, patientId: ObjectId) {
  return db
    .collection("labs_ledger")
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
