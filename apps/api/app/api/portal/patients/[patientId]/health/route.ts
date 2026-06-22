export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

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
  normalizePortalHealthMetric,
  type PortalHealthMetric,
  type PortalPatientHealthData,
} from "@/apps/api/lib/portal/patient-shared";
import {
  buildPortalPatientDetailPipeline,
  buildPortalPatientAccessMatch,
  mapPortalPatientDetail,
  type RawPortalPatientDetailDoc,
} from "@/apps/api/lib/portal/patients";
import { COLLECTIONS } from "@ckd/core/server";

const DEFAULT_DAYS = 365;
const MAX_DAYS = 400;

type PortalHealthClinicalDoc = {
  egfrCurrent?: number | null;
};

type MeasurementDoc = {
  _id?: ObjectId;
  diastolicMmHg?: number;
  kind: "blood_pressure" | "weight";
  measuredAt: Date;
  systolicMmHg?: number;
  valueKg?: number;
};

type SymptomLedgerEventDoc = {
  _id?: ObjectId;
  after?: {
    name?: string;
    note?: string | null;
    recordedAt?: Date;
    severity?: number;
  } | null;
  createdAt?: Date;
  eventType?: string;
  patientId: ObjectId;
};

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function average(values: number[]) {
  return values.length
    ? round1(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0;
}

function getMetricMeta(metric: PortalHealthMetric) {
  if (metric === "blood_pressure") {
    return {
      primaryLabel: "Systolic",
      primaryUnit: "mmHg",
      rowLabel: "Month",
      secondaryLabel: "Diastolic",
      secondaryUnit: "mmHg",
      summaryTitle: "Blood pressure monthly averages",
      tableTitlePrefix: "Blood pressure monthly averages",
    };
  }

  if (metric === "symptoms") {
    return {
      primaryLabel: "Recorded symptoms",
      primaryUnit: "entries",
      rowLabel: "Symptom",
      secondaryLabel: "Avg severity",
      secondaryUnit: "/5",
      summaryTitle: "Symptoms by month",
      tableTitlePrefix: "Symptoms recorded for",
    };
  }

  return {
    primaryLabel: "Weight",
    primaryUnit: "kg",
    rowLabel: "Month",
    secondaryLabel: undefined,
    secondaryUnit: undefined,
    summaryTitle: "Weight monthly averages",
    tableTitlePrefix: "Weight monthly averages",
  };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ patientId: string }> },
) {
  try {
    const caller = await requireUser(req);
    if (caller.role === "patient") {
      return bad("Portal staff session required", { code: "portal_staff_required" }, 403);
    }

    const { patientId } = await context.params;
    if (!ObjectId.isValid(patientId)) {
      return bad("Invalid patient id", { code: "invalid_patient_id" }, 400);
    }

    const metric = normalizePortalHealthMetric(
      req.nextUrl.searchParams.get("metric"),
    );
    const requestedMonth = req.nextUrl.searchParams.get("month");
    const days = Math.min(
      parsePositiveInt(req.nextUrl.searchParams.get("days"), DEFAULT_DAYS),
      MAX_DAYS,
    );
    const currentMonthStart = startOfMonth(new Date());
    const chartMonths = buildChartMonths(currentMonthStart);
    const windowStart = new Date(`${chartMonths[0]}-01T00:00:00.000Z`);

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

    const [clinical, measurements, symptomEvents] = await Promise.all([
      db.collection<PortalHealthClinicalDoc>(COLLECTIONS.UsersClinical).findOne(
        { patientId: patientObjectId },
        { projection: { _id: 0, egfrCurrent: 1 } },
      ),
      metric === "symptoms"
        ? Promise.resolve([])
        : db
            .collection<MeasurementDoc>(COLLECTIONS.MeasurementsLedger)
            .find(
              {
                patientId: patientObjectId,
                kind: metric,
                measuredAt: { $gte: windowStart },
              },
              {
                projection: {
                  _id: 1,
                  diastolicMmHg: 1,
                  kind: 1,
                  measuredAt: 1,
                  systolicMmHg: 1,
                  valueKg: 1,
                },
              },
            )
            .sort({ measuredAt: 1 })
            .toArray(),
      metric !== "symptoms"
        ? Promise.resolve([])
        : db
            .collection<SymptomLedgerEventDoc>(COLLECTIONS.SymptomsLedger)
            .find(
              {
                patientId: patientObjectId,
                createdAt: { $gte: windowStart },
              },
              {
                projection: {
                  _id: 1,
                  after: 1,
                  createdAt: 1,
                  eventType: 1,
                },
              },
            )
            .sort({ createdAt: 1 })
            .toArray(),
    ]);

    const byMonth = new Map<
      string,
      {
        primary: number[];
        secondary: number[];
        docs: MeasurementDoc[];
        symptomEntries: Array<{
          id: string;
          name: string;
          note: string | null;
          recordedAt: Date;
          severity: number;
        }>;
      }
    >();

    for (const month of chartMonths) {
      byMonth.set(month, {
        primary: [],
        secondary: [],
        docs: [],
        symptomEntries: [],
      });
    }

    if (metric === "symptoms") {
      for (const event of symptomEvents) {
        const recordedAt = event.after?.recordedAt ?? event.createdAt ?? null;
        const name = event.after?.name?.trim();
        const severity = event.after?.severity;
        if (!recordedAt || !name || typeof severity !== "number") continue;

        const key = monthKey(recordedAt);
        const bucket = byMonth.get(key);
        if (!bucket) continue;

        bucket.primary.push(1);
        bucket.secondary.push(severity);
        bucket.symptomEntries.push({
          id: event._id?.toString() ?? `${name}-${recordedAt.toISOString()}`,
          name,
          note: event.after?.note ?? null,
          recordedAt,
          severity,
        });
      }
    } else {
      for (const measurement of measurements) {
        const key = monthKey(measurement.measuredAt);
        const bucket = byMonth.get(key);
        if (!bucket) continue;

        if (metric === "blood_pressure") {
          if (typeof measurement.systolicMmHg === "number") {
            bucket.primary.push(measurement.systolicMmHg);
          }
          if (typeof measurement.diastolicMmHg === "number") {
            bucket.secondary.push(measurement.diastolicMmHg);
          }
        } else if (typeof measurement.valueKg === "number") {
          bucket.primary.push(measurement.valueKg);
        }

        bucket.docs.push(measurement);
      }
    }

    const monthlyStats: PortalPatientHealthData["monthlyStats"] = chartMonths.map(
      (month) => {
        const bucket = byMonth.get(month)!;
        return {
          isSelected: false,
          label: formatMonthLabel(month),
          month,
          primaryValue:
            metric === "symptoms"
              ? bucket.symptomEntries.length
              : average(bucket.primary),
          secondaryValue:
            metric === "blood_pressure" || metric === "symptoms"
              ? average(bucket.secondary)
              : null,
        };
      },
    );

    const latestWithData =
      [...monthlyStats]
        .reverse()
        .find((item) => item.primaryValue > 0 || (item.secondaryValue ?? 0) > 0)
        ?.month ??
      monthlyStats[monthlyStats.length - 1]?.month ??
      monthKey(currentMonthStart);

    const selectedMonth =
      requestedMonth && chartMonths.includes(requestedMonth)
        ? requestedMonth
        : latestWithData;

    const selectedMonthLabel = formatMonthLongLabel(selectedMonth);
    const mappedPatient = mapPortalPatientDetail(patient);
    const meta = getMetricMeta(metric);
    const rows =
      metric === "symptoms"
        ? (() => {
            const selectedBucket = byMonth.get(selectedMonth) ?? {
              docs: [],
              primary: [],
              secondary: [],
              symptomEntries: [],
            };
            const grouped = new Map<
              string,
              {
                count: number;
                latestNote: string | null;
                latestRecordedAt: Date;
                name: string;
                severities: number[];
              }
            >();

            for (const entry of selectedBucket.symptomEntries) {
              const key = entry.name.trim().toLowerCase();
              const existing = grouped.get(key);
              if (!existing) {
                grouped.set(key, {
                  count: 1,
                  latestNote: entry.note,
                  latestRecordedAt: entry.recordedAt,
                  name: entry.name,
                  severities: [entry.severity],
                });
                continue;
              }
              existing.count += 1;
              existing.severities.push(entry.severity);
              if (entry.recordedAt > existing.latestRecordedAt) {
                existing.latestRecordedAt = entry.recordedAt;
                existing.latestNote = entry.note;
              }
            }

            return Array.from(grouped.entries())
              .map(([key, value]) => ({
                detail: value.latestNote,
                id: `${selectedMonth}-${key}`,
                label: value.name,
                primaryValue: value.count,
                secondaryValue: average(value.severities),
              }))
              .sort((left, right) => right.primaryValue - left.primaryValue);
          })()
        : monthlyStats
            .filter(
              (item) =>
                item.primaryValue > 0 || (item.secondaryValue ?? 0) > 0,
            )
            .slice()
            .reverse()
            .map((item) => ({
              detail: null,
              id: item.month,
              label: formatMonthLongLabel(item.month),
              primaryValue: item.primaryValue,
              secondaryValue: item.secondaryValue,
            }));

    const data: PortalPatientHealthData = {
      headline: `Viewing ${mappedPatient.name} - eGFR stable - ${
        clinical?.egfrCurrent ?? "n/a"
      }`,
      monthlyStats: monthlyStats.map((item) => ({
        ...item,
        isSelected: item.month === selectedMonth,
      })),
      patient: mappedPatient,
      rows,
      selectedMetric: metric,
      selectedMonth,
      selectedMonthLabel,
      series: {
        primaryLabel: meta.primaryLabel,
        primaryUnit: meta.primaryUnit,
        rowLabel: meta.rowLabel,
        secondaryLabel: meta.secondaryLabel,
        secondaryUnit: meta.secondaryUnit,
      },
      summaryTitle: meta.summaryTitle,
      tableTitle: `${meta.tableTitlePrefix} ${selectedMonthLabel}`,
      window: {
        days,
        from: `${chartMonths[0]}-01T00:00:00.000Z`,
        to: `${chartMonths[chartMonths.length - 1]}-31T23:59:59.999Z`,
      },
    };

    return ok(data);
  } catch (error: any) {
    return bad(
      error?.message || "Unable to load patient health data",
      undefined,
      error?.status || 500,
    );
  }
}
