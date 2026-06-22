export const runtime = "nodejs";

import { NextRequest } from "next/server";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import {
  buildChartMonths,
  formatMonthLabel,
  formatMonthLongLabel,
  monthKey,
  parsePositiveInt,
  startOfMonth,
} from "@/apps/api/lib/portal/time";
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
  type PortalPatientNutritionData,
} from "@/apps/api/lib/portal/patient-shared";
import {
  buildPortalPatientDetailPipeline,
  buildPortalPatientAccessMatch,
  mapPortalPatientDetail,
  type RawPortalPatientDetailDoc,
} from "@/apps/api/lib/portal/patients";
import { getMappedNutritionTargets } from "@/apps/api/lib/utils/targets";
import { COLLECTIONS } from "@ckd/core/server";
import { ObjectId } from "mongodb";

const DEFAULT_DAYS = 365;
const MAX_DAYS = 400;

type PortalNutritionClinicalDoc = {
  egfrCurrent?: number | null;
};

function resolveTargetValue(
  targets: Partial<Record<PortalNutritionFilter, number>>,
  filter: PortalNutritionFilter,
) {
  const value = targets[filter];
  return typeof value === "number" ? value : null;
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
    const currentMonthStart = startOfMonth(new Date());
    const chartMonths = buildChartMonths(currentMonthStart);

    const db = await getDb();
    const patientObjectId = new ObjectId(patientId);
    const patient = await db
      .collection(COLLECTIONS.Patients)
      .aggregate<RawPortalPatientDetailDoc>(
        buildPortalPatientDetailPipeline({
          ...buildPortalPatientAccessMatch(caller),
          _id: patientObjectId,
        }),
      )
      .next();

    if (!patient) {
      return bad("Patient not found", { code: "patient_not_found" }, 404);
    }

    const [summaryDocs, targets, clinical] = await Promise.all([
      db
        .collection<NutritionMonthlyPatientSummaryDoc>(
          NUTRITION_MONTHLY_PATIENT_SUMMARY_COLLECTION,
        )
        .find(
          {
            month: { $in: chartMonths },
            $or: [{ patientId: patientObjectId }, { patientId }],
          },
          {
            projection: {
              _id: 0,
              dailyAverages: 1,
              month: 1,
              patientId: 1,
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
      db.collection<PortalNutritionClinicalDoc>(COLLECTIONS.UsersClinical).findOne(
        { patientId: patientObjectId },
        { projection: { _id: 0, egfrCurrent: 1 } },
      ),
    ]);
    const summaryByMonth = new Map(summaryDocs.map((doc) => [doc.month, doc]));
    const monthlyStats: PortalPatientNutritionData["monthlyStats"] =
      chartMonths.map((month) => {
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

    const foodRows = mapSummaryTopFoodsToPortalRows(
      summaryByMonth.get(selectedMonth)?.topFoods?.[filter],
      filter,
    ).sort((left, right) => right.currentMonthAmount - left.currentMonthAmount);

    const selectedMonthLabel = formatMonthLongLabel(selectedMonth);
    const metricLabel = resolveNutritionMetricLabel(filter);
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
        from: `${chartMonths[0]}-01T00:00:00.000Z`,
        to: `${chartMonths[chartMonths.length - 1]}-31T23:59:59.999Z`,
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
