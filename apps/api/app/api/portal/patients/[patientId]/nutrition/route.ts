export const runtime = "nodejs";

import { NextRequest } from "next/server";

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
  type PortalPatientNutritionData,
} from "@/apps/api/lib/portal/patient-shared";
import {
  buildPortalPatientAccessMatch,
  mapPortalPatientDetail,
} from "@/apps/api/lib/portal/patients";
import { getMappedNutritionTargets } from "@/apps/api/lib/utils/targets";
import { COLLECTIONS } from "@ckd/core/server";
import { ObjectId } from "mongodb";

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

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
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

function buildChartMonths(currentMonthStart: Date) {
  return Array.from({ length: 12 }, (_, offset) =>
    monthKey(addMonths(currentMonthStart, offset - 11)),
  );
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
      db.collection<ClinicalDoc>(COLLECTIONS.UsersClinical).findOne(
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
