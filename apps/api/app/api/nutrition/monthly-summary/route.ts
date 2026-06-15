export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  mapSummaryTopFoodsToPortalRows,
  NUTRITION_MONTHLY_PATIENT_SUMMARY_COLLECTION,
  resolveNutritionMetricLabel,
  type NutritionMonthlyPatientSummaryDoc,
} from "@/apps/api/lib/portal/nutritionMonthlySummary";
import {
  normalizePortalNutritionFilter,
  type PortalNutritionFilter,
} from "@/apps/api/lib/portal/patient-shared";
import { getMappedNutritionTargets } from "@/apps/api/lib/utils/targets";
import { ROLES } from "@ckd/core";

const DEFAULT_MONTHS = 12;

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date: Date, delta: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}

function buildChartMonths(currentMonthStart: Date) {
  return Array.from({ length: DEFAULT_MONTHS }, (_, offset) =>
    monthKey(addMonths(currentMonthStart, offset - (DEFAULT_MONTHS - 1))),
  );
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

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }

    const requestedMonth = req.nextUrl.searchParams.get("month");
    const filter = normalizePortalNutritionFilter(
      req.nextUrl.searchParams.get("filter"),
    );
    const currentMonthStart = startOfMonth(new Date());
    const chartMonths = buildChartMonths(currentMonthStart);
    const db = await getDb();
    const patientObjectId = new ObjectId(caller.patientId);

    const [summaryDocs, targets] = await Promise.all([
      db
        .collection<NutritionMonthlyPatientSummaryDoc>(
          NUTRITION_MONTHLY_PATIENT_SUMMARY_COLLECTION,
        )
        .find(
          {
            month: { $in: chartMonths },
            $or: [{ patientId: patientObjectId }, { patientId: caller.patientId }],
          },
          {
            projection: {
              _id: 0,
              dailyAverages: 1,
              month: 1,
              targetSnapshot: 1,
              topFoods: 1,
            },
          },
        )
        .toArray(),
      getMappedNutritionTargets(db, patientObjectId, {
        orgId: caller.orgId,
        seedPrincipalId: caller.principalId,
      }),
    ]);

    const summaryByMonth = new Map(summaryDocs.map((doc) => [doc.month, doc]));
    const monthlyStats = chartMonths.map((month) => {
      const summary = summaryByMonth.get(month);
      const value =
        typeof summary?.dailyAverages?.[filter] === "number"
          ? Math.round(summary.dailyAverages[filter]! * 10) / 10
          : 0;

      return {
        isSelected: false,
        label: formatMonthLabel(month),
        month,
        target:
          resolveTargetValue(summary?.targetSnapshot ?? {}, filter) ??
          resolveTargetValue(targets, filter),
        value,
      };
    });

    const latestWithData =
      [...monthlyStats].reverse().find((item) => item.value > 0)?.month ??
      monthlyStats[monthlyStats.length - 1]?.month ??
      monthKey(currentMonthStart);

    const selectedMonth =
      requestedMonth && chartMonths.includes(requestedMonth)
        ? requestedMonth
        : latestWithData;

    const selectedMonthLabel = formatMonthLongLabel(selectedMonth);
    const metricLabel = resolveNutritionMetricLabel(filter);
    const foodRows = mapSummaryTopFoodsToPortalRows(
      summaryByMonth.get(selectedMonth)?.topFoods?.[filter],
      filter,
    ).sort((left, right) => right.currentMonthAmount - left.currentMonthAmount);

    return ok({
      foodRows,
      monthlyStats: monthlyStats.map((item) => ({
        ...item,
        isSelected: item.month === selectedMonth,
      })),
      selectedFilter: filter,
      selectedMonth,
      selectedMonthLabel,
      summaryTitle: `${metricLabel} monthly stats`,
      tableTitle: `Foods with highest ${metricLabel.toLowerCase()} for ${selectedMonthLabel}`,
      window: {
        from: `${chartMonths[0]}-01T00:00:00.000Z`,
        months: DEFAULT_MONTHS,
        to: `${chartMonths[chartMonths.length - 1]}-31T23:59:59.999Z`,
      },
    });
  } catch (error: any) {
    return bad(
      error?.message || "Unable to load monthly nutrition summary",
      undefined,
      error?.status || 500,
    );
  }
}
