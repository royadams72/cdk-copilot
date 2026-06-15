export const runtime = "nodejs";

import { NextRequest } from "next/server";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  normalizePortalNutritionFilter,
  type PortalNutritionFilter,
  type PortalPatientNutritionData,
} from "@/apps/api/lib/portal/patient-shared";
import {
  buildPortalPatientAccessMatch,
  mapPortalPatientDetail,
} from "@/apps/api/lib/portal/patients";
import type { NutritionEntryDoc } from "@/apps/api/lib/types/dashboard";
import { getMappedNutritionTargets } from "@/apps/api/lib/utils/targets";
import { COLLECTIONS } from "@ckd/core/server";
import { ObjectId } from "mongodb";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 365;
const MAX_DAYS = 400;

type RawPortalPatientDetailDoc = {
  _id: ObjectId;
  assignments?: Array<{
    careTeamId?: string;
    consentStatus?: string;
    endsAt?: Date | string | null;
    facilityId?: string;
    orgId?: string;
    startsAt?: Date | string | null;
    status?: string;
  }>;
  flags?: string[];
  pii?: {
    dateOfBirth?: Date | string | null;
    email?: string;
    firstName?: string;
    lastName?: string;
  } | null;
  stage?: string | null;
  summary?: {
    lastContactAt?: Date | string | null;
    risk?: "green" | "amber" | "red" | null;
  } | null;
};

type ClinicalDoc = {
  egfrCurrent?: number | null;
};

type FoodAggregate = {
  currentMonthAmount: number;
  timesLogged: number;
  previousMonthAmount: number;
};

type MonthAggregate = {
  dayKeys: Set<string>;
  total: number;
};

const NUTRITION_FILTER_LABELS: Record<PortalNutritionFilter, string> = {
  caloriesKcal: "Calories",
  phosphorusMg: "Phosphorus",
  potassiumMg: "Potassium",
  proteinG: "Protein",
  sodiumMg: "Sodium",
};

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getMetricValue(
  entry: Pick<NutritionEntryDoc, "totals">,
  filter: PortalNutritionFilter,
) {
  const value = entry.totals?.[filter];
  return typeof value === "number" ? value : 0;
}

function getItemMetricValue(
  item: NonNullable<NutritionEntryDoc["items"]>[number],
  filter: PortalNutritionFilter,
) {
  const value = item.nutrients?.[filter];
  return typeof value === "number" ? value : 0;
}

function getEntryDate(entry: Pick<NutritionEntryDoc, "createdAt" | "eatenAt">) {
  return entry.eatenAt ?? entry.createdAt ?? null;
}

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date: Date, delta: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}

function formatMonthLabel(month: string) {
  const [year, monthPart] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(monthPart) - 1, 1));
  return new Intl.DateTimeFormat("en-GB", { month: "short" }).format(date).toUpperCase();
}

function formatMonthLongLabel(month: string) {
  const [year, monthPart] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(monthPart) - 1, 1));
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function resolveTargetValue(
  targets: Partial<Record<PortalNutritionFilter, number>>,
  filter: PortalNutritionFilter,
) {
  const value = targets[filter];
  return typeof value === "number" ? value : null;
}

function getLevelLabel(filter: PortalNutritionFilter, averageAmount: number) {
  const bands: Record<PortalNutritionFilter, [number, number, number]> = {
    caloriesKcal: [700, 500, 250],
    phosphorusMg: [250, 160, 80],
    potassiumMg: [700, 450, 200],
    proteinG: [30, 18, 8],
    sodiumMg: [450, 250, 100],
  };
  const [high, mediumHigh, medium] = bands[filter];
  if (averageAmount >= high) return "High";
  if (averageAmount >= mediumHigh) return "Medium-high";
  if (averageAmount >= medium) return "Medium";
  return "Low";
}

function getTrend(
  currentMonthAmount: number,
  previousMonthAmount: number,
): "increased" | "same" | "reduced" {
  if (previousMonthAmount === 0) {
    return currentMonthAmount > 0 ? "increased" : "same";
  }
  if (currentMonthAmount >= previousMonthAmount * 1.1) {
    return "increased";
  }
  if (currentMonthAmount <= previousMonthAmount * 0.9) {
    return "reduced";
  }
  return "same";
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ patientId: string }> },
) {
  try {
    const caller = await requireUser(req);
    if (caller.role === "patient") {
      return bad(
        "Portal staff session required",
        { code: "portal_staff_required" },
        403,
      );
    }

    const { patientId } = await context.params;
    if (!ObjectId.isValid(patientId)) {
      return bad("Invalid patient id", { code: "invalid_patient_id" }, 400);
    }

    const filter = normalizePortalNutritionFilter(
      req.nextUrl.searchParams.get("filter"),
    );
    const requestedMonth = req.nextUrl.searchParams.get("month");
    const days = Math.min(
      parsePositiveInt(req.nextUrl.searchParams.get("days"), DEFAULT_DAYS),
      MAX_DAYS,
    );
    const windowEnd = new Date();
    const currentMonthStart = startOfMonth(windowEnd);
    const chartStart = addMonths(currentMonthStart, -11);
    const windowStart = new Date(
      Math.min(chartStart.getTime(), windowEnd.getTime() - (days - 1) * DAY_MS),
    );

    const db = await getDb();
    const patientObjectId = new ObjectId(patientId);
    const patient = await db
      .collection(COLLECTIONS.Patients)
      .aggregate<RawPortalPatientDetailDoc>([
        {
          $match: {
            ...buildPortalPatientAccessMatch(caller),
            _id: patientObjectId,
          },
        },
        {
          $lookup: {
            as: "pii",
            foreignField: "patientId",
            from: COLLECTIONS.UsersPII,
            pipeline: [
              {
                $project: {
                  _id: 0,
                  dateOfBirth: 1,
                  email: 1,
                  firstName: 1,
                  lastName: 1,
                },
              },
            ],
            localField: "_id",
          },
        },
        {
          $project: {
            assignments: 1,
            flags: 1,
            pii: { $arrayElemAt: ["$pii", 0] },
            stage: 1,
            summary: 1,
          },
        },
      ])
      .next();

    if (!patient) {
      return bad("Patient not found", { code: "patient_not_found" }, 404);
    }

    const [entries, targets, clinical] = await Promise.all([
      db
        .collection<NutritionEntryDoc>(COLLECTIONS.NutritionLedger)
        .find(
          {
            patientId: patientObjectId,
            $or: [
              { eatenAt: { $gte: windowStart } },
              { eatenAt: null, createdAt: { $gte: windowStart } },
              { eatenAt: { $exists: false }, createdAt: { $gte: windowStart } },
            ],
          },
          {
            projection: {
              _id: 1,
              createdAt: 1,
              eatenAt: 1,
              items: 1,
              totals: 1,
            },
          },
        )
        .sort({ eatenAt: -1, createdAt: -1 })
        .toArray(),
      getMappedNutritionTargets(db, patientObjectId, {
        orgId: caller.orgId,
        seedPrincipalId: caller.principalId,
      }),
      db.collection<ClinicalDoc>(COLLECTIONS.UsersClinical).findOne(
        { patientId: patientObjectId },
        { projection: { _id: 0, egfrCurrent: 1 } },
      ),
    ]);

    const byMonth = new Map<string, MonthAggregate>();
    for (let offset = 0; offset < 12; offset += 1) {
      const date = addMonths(chartStart, offset);
      byMonth.set(monthKey(date), { dayKeys: new Set<string>(), total: 0 });
    }

    for (const entry of entries) {
      const entryDate = getEntryDate(entry);
      if (!entryDate || entryDate < chartStart) {
        continue;
      }
      const key = monthKey(entryDate);
      const aggregate = byMonth.get(key);
      if (!aggregate) {
        continue;
      }
      aggregate.total += getMetricValue(entry, filter);
      aggregate.dayKeys.add(dayKey(entryDate));
    }

    const monthlyStats = Array.from(byMonth.entries()).map(([month, aggregate]) => {
      const daysLogged = aggregate.dayKeys.size;
      return {
        isSelected: false,
        label: formatMonthLabel(month),
        month,
        target: resolveTargetValue(targets, filter),
        value:
          daysLogged > 0
            ? Math.round((aggregate.total / daysLogged) * 10) / 10
            : 0,
      };
    });

    const latestWithData =
      [...monthlyStats].reverse().find((item) => item.value > 0)?.month ??
      monthlyStats[monthlyStats.length - 1]?.month ??
      monthKey(currentMonthStart);

    const selectedMonth = requestedMonth && byMonth.has(requestedMonth)
      ? requestedMonth
      : latestWithData;

    const previousMonth = monthKey(addMonths(new Date(`${selectedMonth}-01T00:00:00.000Z`), -1));
    const foodMap = new Map<string, FoodAggregate>();

    for (const entry of entries) {
      const entryDate = getEntryDate(entry);
      if (!entryDate) {
        continue;
      }
      const entryMonth = monthKey(entryDate);
      if (entryMonth !== selectedMonth && entryMonth !== previousMonth) {
        continue;
      }

      for (const item of entry.items ?? []) {
        const name = item.name?.trim();
        if (!name) {
          continue;
        }
        const metric = getItemMetricValue(item, filter);
        const current = foodMap.get(name) ?? {
          currentMonthAmount: 0,
          previousMonthAmount: 0,
          timesLogged: 0,
        };

        if (entryMonth === selectedMonth) {
          current.currentMonthAmount += metric;
          current.timesLogged += 1;
        } else {
          current.previousMonthAmount += metric;
        }

        foodMap.set(name, current);
      }
    }

    const foodRows: PortalPatientNutritionData["foodRows"] = Array.from(
      foodMap.entries(),
    )
      .filter(([, aggregate]) => aggregate.currentMonthAmount > 0)
      .map(([food, aggregate]) => {
        const averageAmount = aggregate.currentMonthAmount / aggregate.timesLogged;
        return {
          averageAmount,
          currentMonthAmount: aggregate.currentMonthAmount,
          food,
          levelLabel: getLevelLabel(filter, averageAmount),
          timesLogged: aggregate.timesLogged,
          trend: getTrend(
            aggregate.currentMonthAmount,
            aggregate.previousMonthAmount,
          ),
        };
      })
      .sort((left, right) => right.currentMonthAmount - left.currentMonthAmount);

    const selectedMonthLabel = formatMonthLongLabel(selectedMonth);
    const metricLabel = NUTRITION_FILTER_LABELS[filter];
    const mappedPatient = mapPortalPatientDetail(patient);
    const data: PortalPatientNutritionData = {
      foodRows,
      headline: `Viewing ${mappedPatient.name} - eGFR stable - ${
        clinical?.egfrCurrent ?? "n/a"
      }`,
      monthlyStats: monthlyStats.map((item) => ({
        ...item,
        isSelected: item.month === selectedMonth,
      })),
      patient: mappedPatient,
      selectedFilter: filter,
      selectedMonth,
      selectedMonthLabel,
      summaryTitle: `${metricLabel} monthly stats`,
      tableTitle: `Foods with highest ${metricLabel.toLowerCase()} for ${selectedMonthLabel}`,
      window: {
        days,
        from: windowStart.toISOString(),
        to: windowEnd.toISOString(),
      },
    };

    return ok(data);
  } catch (error: any) {
    return bad(
      error?.message || "Unable to load patient nutrition data",
      undefined,
      error?.status || 500,
    );
  }
}
