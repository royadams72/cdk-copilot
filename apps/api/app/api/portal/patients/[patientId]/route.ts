export const runtime = "nodejs";

import { NextRequest } from "next/server";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { formatDisplayDate } from "@/apps/api/lib/format/date";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  buildPortalPatientDetailPipeline,
  buildPortalPatientAccessMatch,
  mapPortalPatientDetail,
  type RawPortalPatientDetailDoc,
} from "@/apps/api/lib/portal/patients";
import { COLLECTIONS } from "@ckd/core/server";
import { ObjectId } from "mongodb";

const DAY_MS = 24 * 60 * 60 * 1000;

type MeasurementDoc = {
  diastolicMmHg?: number;
  kind: "blood_pressure" | "weight";
  measuredAt: Date;
  systolicMmHg?: number;
  valueKg?: number;
};

type NutritionDoc = {
  eatenAt: Date;
  totals?: {
    potassiumMg?: number;
    sodiumMg?: number;
  };
};

type PortalPatientSummaryClinicalDoc = {
  egfrCurrent?: number | null;
  medications?: Array<{ name?: string }>;
};

type CarePlanActivityDoc = {
  at: Date;
  key: string;
  note?: string | null;
  type: string;
};

type CarePlanDoc = {
  _id: ObjectId;
  activatedAt?: Date | null;
  activity?: CarePlanActivityDoc[];
  completedAt?: Date | null;
  reviewLabel?: string | null;
  status: "draft" | "active" | "completed" | "archived";
  tasks?: Array<{ status?: string }>;
  title: string;
  updatedAt: Date;
};

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function countDistinctDays(values: Date[]) {
  return new Set(values.map(dateKey)).size;
}

function latestByDate<T>(items: T[], getDate: (item: T) => Date | null | undefined) {
  return items.reduce<T | null>((latest, item) => {
    const date = getDate(item);
    if (!date) return latest;
    if (!latest) return item;
    const latestDate = getDate(latest);
    if (!latestDate) return item;
    return date.getTime() > latestDate.getTime() ? item : latest;
  }, null);
}

function getWeightTrend(measurements: MeasurementDoc[]) {
  if (measurements.length < 2) {
    return "Stable";
  }

  const sorted = [...measurements].sort(
    (left, right) => left.measuredAt.getTime() - right.measuredAt.getTime(),
  );
  const first = sorted[0]?.valueKg ?? null;
  const last = sorted[sorted.length - 1]?.valueKg ?? null;
  if (typeof first !== "number" || typeof last !== "number") {
    return "Stable";
  }

  const delta = last - first;
  if (delta >= 0.6) {
    return "Increased";
  }
  if (delta <= -0.6) {
    return "Improved";
  }
  return "Stable";
}

function getBloodPressureTrend(measurements: MeasurementDoc[]) {
  if (measurements.length < 2) {
    return "Stable";
  }

  const midpoint = Math.ceil(measurements.length / 2);
  const older = measurements.slice(0, midpoint);
  const recent = measurements.slice(midpoint);
  const average = (docs: MeasurementDoc[], key: "systolicMmHg" | "diastolicMmHg") =>
    docs.reduce((sum, doc) => sum + (doc[key] ?? 0), 0) / docs.length;

  const olderSys = average(older, "systolicMmHg");
  const recentSys = average(recent, "systolicMmHg");
  const olderDia = average(older, "diastolicMmHg");
  const recentDia = average(recent, "diastolicMmHg");

  if (recentSys + recentDia < olderSys + olderDia - 4) {
    return "Improved";
  }
  if (recentSys + recentDia > olderSys + olderDia + 4) {
    return "Increased";
  }
  return "Stable";
}

function getThresholdCopy(
  docs: NutritionDoc[],
  key: "sodiumMg" | "potassiumMg",
  threshold: number,
) {
  const overTargetDays = countDistinctDays(
    docs
      .filter((doc) => (doc.totals?.[key] ?? 0) > threshold)
      .map((doc) => doc.eatenAt),
  );

  if (overTargetDays === 0) {
    return "Improved";
  }
  if (overTargetDays <= 3) {
    return "Fewer days above target";
  }
  return `${overTargetDays} days above target`;
}

function getRiskLabel(risk: "green" | "amber" | "red" | "unknown") {
  switch (risk) {
    case "green":
      return "Green";
    case "amber":
      return "Amber";
    case "red":
      return "Red";
    default:
      return "Unknown";
  }
}

function formatBloodPressure(doc: MeasurementDoc | null) {
  if (!doc) return "No reading";
  if (typeof doc.systolicMmHg !== "number" || typeof doc.diastolicMmHg !== "number") {
    return "Incomplete reading";
  }
  return `${doc.systolicMmHg}/${doc.diastolicMmHg} mmHg`;
}

function formatWeight(doc: MeasurementDoc | null) {
  if (!doc || typeof doc.valueKg !== "number") return "No reading";
  return `${doc.valueKg.toFixed(1)} kg`;
}

function getReviewIntervalDays(reviewLabel: string | null | undefined) {
  switch (reviewLabel) {
    case "1_week":
      return 7;
    case "2_weeks":
      return 14;
    case "1_month":
      return 30;
    case "3_months":
      return 90;
    default:
      return null;
  }
}

function getNextReviewAt(plan: CarePlanDoc) {
  const days = getReviewIntervalDays(plan.reviewLabel);
  if (!days) return null;
  const base = plan.activatedAt ?? plan.updatedAt;
  return new Date(base.getTime() + days * DAY_MS);
}

function isReviewDue(plan: CarePlanDoc) {
  if (plan.status !== "active") return false;
  const nextReviewAt = getNextReviewAt(plan);
  if (!nextReviewAt) return false;
  return nextReviewAt.getTime() <= Date.now();
}

function getCarePlanActivityLabel(type: string) {
  switch (type) {
    case "activated":
      return "Care plan activated";
    case "completed":
      return "Care plan completed";
    case "archived":
      return "Care plan archived";
    case "draft_updated":
      return "Care plan draft updated";
    case "created":
      return "Care plan created";
    default:
      return "Care plan updated";
  }
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

    const windowStart = new Date(Date.now() - 31 * DAY_MS);
    const [clinical, nutritionDocs, measurementDocs, carePlans] = await Promise.all([
      db.collection<PortalPatientSummaryClinicalDoc>(COLLECTIONS.UsersClinical).findOne(
        { patientId: patientObjectId },
        { projection: { _id: 0, egfrCurrent: 1, medications: 1 } },
      ),
      db.collection<NutritionDoc>(COLLECTIONS.NutritionLedger)
        .find(
          { patientId: patientObjectId, eatenAt: { $gte: windowStart } },
          { projection: { _id: 0, eatenAt: 1, totals: 1 } },
        )
        .toArray(),
      db.collection<MeasurementDoc>(COLLECTIONS.MeasurementsLedger)
        .find(
          {
            kind: { $in: ["blood_pressure", "weight"] },
            measuredAt: { $gte: windowStart },
            patientId: patientObjectId,
          },
          {
            projection: {
              _id: 0,
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
      db.collection<CarePlanDoc>(COLLECTIONS.CarePlans)
        .find(
          { patientId: patientObjectId },
          {
            projection: {
              _id: 1,
              activatedAt: 1,
              activity: 1,
              completedAt: 1,
              reviewLabel: 1,
              status: 1,
              tasks: 1,
              title: 1,
              updatedAt: 1,
            },
          },
        )
        .toArray(),
    ]);

    const mappedPatient = mapPortalPatientDetail(patient);
    const weightDocs = measurementDocs.filter((doc) => doc.kind === "weight");
    const bloodPressureDocs = measurementDocs.filter(
      (doc) => doc.kind === "blood_pressure",
    );
    const latestBloodPressure = latestByDate(bloodPressureDocs, (doc) => doc.measuredAt);
    const latestWeight = latestByDate(weightDocs, (doc) => doc.measuredAt);
    const latestMealLog = latestByDate(nutritionDocs, (doc) => doc.eatenAt);
    const activeCarePlan = latestByDate(
      carePlans.filter((plan) => plan.status === "active"),
      (plan) => plan.updatedAt,
    );
    const latestCarePlan = latestByDate(carePlans, (plan) => plan.updatedAt);
    const mealLoggingDays = countDistinctDays(nutritionDocs.map((doc) => doc.eatenAt));
    const bloodPressureLoggingDays = countDistinctDays(
      bloodPressureDocs.map((doc) => doc.measuredAt),
    );
    const weightLoggingDays = countDistinctDays(weightDocs.map((doc) => doc.measuredAt));
    const activeCarePlanCount = carePlans.filter((plan) => plan.status === "active").length;
    const reviewDueCount = carePlans.filter(isReviewDue).length;
    const daysSinceLastContact = mappedPatient.lastContactAt
      ? Math.floor((Date.now() - new Date(mappedPatient.lastContactAt).getTime()) / DAY_MS)
      : null;

    const attentionItems = [];
    if (activeCarePlanCount === 0) {
      attentionItems.push({
        detail: "There is no active care plan for this patient.",
        href: `/portal/patients/${patientId}/care-plans`,
        title: "No active care plan",
        tone: "warning" as const,
      });
    }
    if (reviewDueCount > 0) {
      attentionItems.push({
        detail: `${reviewDueCount} active care plan${reviewDueCount === 1 ? "" : "s"} should be reviewed.`,
        href: `/portal/patients/${patientId}/care-plans`,
        title: "Care plan review due",
        tone: "warning" as const,
      });
    }
    if (!latestBloodPressure || Date.now() - latestBloodPressure.measuredAt.getTime() > 14 * DAY_MS) {
      attentionItems.push({
        detail: "No blood pressure reading has been logged in the last 14 days.",
        href: `/portal/patients/${patientId}/health`,
        title: "Missing recent blood pressure data",
        tone: "warning" as const,
      });
    }
    if (!latestWeight || Date.now() - latestWeight.measuredAt.getTime() > 14 * DAY_MS) {
      attentionItems.push({
        detail: "No weight reading has been logged in the last 14 days.",
        href: `/portal/patients/${patientId}/health`,
        title: "Missing recent weight data",
        tone: "warning" as const,
      });
    }
    if (daysSinceLastContact !== null && daysSinceLastContact >= 14) {
      attentionItems.push({
        detail: `Last contact was ${daysSinceLastContact} day${daysSinceLastContact === 1 ? "" : "s"} ago.`,
        href: `/portal/patients/${patientId}/nutrition`,
        title: "Patient may be disengaged",
        tone: "warning" as const,
      });
    }
    if (
      activeCarePlan &&
      (activeCarePlan.tasks?.filter((task) => task.status === "open").length ?? 0) > 0 &&
      mealLoggingDays === 0 &&
      bloodPressureLoggingDays === 0 &&
      weightLoggingDays === 0
    ) {
      attentionItems.push({
        detail: "An active care plan exists, but there has been no nutrition, blood pressure or weight data in the last 31 days.",
        href: `/portal/patients/${patientId}/health`,
        title: "Active plan with no recent patient data",
        tone: "warning" as const,
      });
    }
    if (
      latestBloodPressure &&
      ((latestBloodPressure.systolicMmHg ?? 0) >= 140 ||
        (latestBloodPressure.diastolicMmHg ?? 0) >= 90)
    ) {
      attentionItems.push({
        detail: `${formatBloodPressure(latestBloodPressure)} on ${formatDisplayDate(
          latestBloodPressure.measuredAt,
        )}.`,
        href: `/portal/patients/${patientId}/health`,
        title: "Latest blood pressure above target",
        tone: "warning" as const,
      });
    }
    if (attentionItems.length === 0) {
      attentionItems.push({
        detail: "Nothing urgent is flagged on the overview right now.",
        title: "No urgent issues",
        tone: "success" as const,
      });
    }

    const recentActivity = [
      ...((latestCarePlan?.activity ?? []).map((event) => {
        const planTitle = latestCarePlan?.title ?? "Care plan";
        return {
          at: event.at.toISOString(),
          detail: event.note?.trim()
            ? `${planTitle}: ${event.note.trim()}`
            : planTitle,
          id: `care-plan-${event.key}`,
          label: getCarePlanActivityLabel(event.type),
        };
      })),
      ...(latestBloodPressure
        ? [
            {
              at: latestBloodPressure.measuredAt.toISOString(),
              detail: formatBloodPressure(latestBloodPressure),
              id: `bp-${latestBloodPressure.measuredAt.toISOString()}`,
              label: "Blood pressure logged",
            },
          ]
        : []),
      ...(latestWeight
        ? [
            {
              at: latestWeight.measuredAt.toISOString(),
              detail: formatWeight(latestWeight),
              id: `weight-${latestWeight.measuredAt.toISOString()}`,
              label: "Weight logged",
            },
          ]
        : []),
      ...(latestMealLog
        ? [
            {
              at: latestMealLog.eatenAt.toISOString(),
              detail: "Nutrition data logged",
              id: `meal-${latestMealLog.eatenAt.toISOString()}`,
              label: "Meal logged",
            },
          ]
        : []),
    ]
      .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
      .slice(0, 5);
    return ok({
      dashboard: {
        actionCards: [
          "Nutrition Data",
          "Health Data",
          "Care Plans",
          "Patient targets",
          "Medication Profile",
          "Nutrition Profile",
          "Diagnoses",
          "Messaging",
        ],
        attentionItems,
        carePlanSnapshot: activeCarePlan
          ? {
              href: `/portal/patients/${patientId}/care-plans/${activeCarePlan._id.toHexString()}`,
              nextReviewAt: getNextReviewAt(activeCarePlan)?.toISOString() ?? null,
              openTasksLabel: `${
                activeCarePlan.tasks?.filter((task) => task.status === "open").length ?? 0
              } open tasks`,
              reviewLabel: activeCarePlan.reviewLabel?.trim() || null,
              status: "Active",
              title: activeCarePlan.title,
              updatedAt: activeCarePlan.updatedAt.toISOString(),
            }
          : latestCarePlan
            ? {
                href: `/portal/patients/${patientId}/care-plans/${latestCarePlan._id.toHexString()}`,
                nextReviewAt: getNextReviewAt(latestCarePlan)?.toISOString() ?? null,
                openTasksLabel: `${
                  latestCarePlan.tasks?.filter((task) => task.status === "open").length ?? 0
                } open tasks`,
                reviewLabel: latestCarePlan.reviewLabel?.trim() || null,
                status:
                  latestCarePlan.status.charAt(0).toUpperCase() + latestCarePlan.status.slice(1),
                title: latestCarePlan.title,
                updatedAt: latestCarePlan.updatedAt.toISOString(),
              }
            : null,
        clinicalSummary: [
          {
            label: "Blood pressure",
            value: getBloodPressureTrend(bloodPressureDocs),
          },
          {
            label: "Weight",
            value: getWeightTrend(weightDocs),
          },
          {
            label: "Sodium",
            value: getThresholdCopy(nutritionDocs, "sodiumMg", 2300),
          },
          {
            label: "Potassium",
            value: getThresholdCopy(nutritionDocs, "potassiumMg", 3500),
          },
        ],
        currentStatus: [
          { label: "CKD stage", value: mappedPatient.stage ?? "Not recorded" },
          { label: "Risk", value: getRiskLabel(mappedPatient.risk) },
          {
            href: `/portal/patients/${patientId}/care-plans`,
            label: "Active care plans",
            value: String(activeCarePlanCount),
          },
          {
            href: `/portal/patients/${patientId}/medication`,
            label: "Medication profile",
            value: `${clinical?.medications?.length ?? 0} medicines`,
          },
        ],
        engagementSummary: [
          { label: "Meal logging", value: `${mealLoggingDays}/31 days` },
          {
            label: "Blood pressure logging",
            value: `${bloodPressureLoggingDays}/31 days`,
          },
          { label: "Weight logging", value: `${weightLoggingDays}/31 days` },
          {
            label: "Medication profile",
            value: `${clinical?.medications?.length ?? 0} medicines`,
          },
        ],
        headline: `Viewing ${mappedPatient.name}`,
        latestReadings: [
          {
            href: `/portal/patients/${patientId}/health`,
            label: "Blood pressure",
            meta: latestBloodPressure
              ? `Recorded ${formatDisplayDate(latestBloodPressure.measuredAt)}`
              : "No recent reading",
            value: formatBloodPressure(latestBloodPressure),
          },
          {
            href: `/portal/patients/${patientId}/health`,
            label: "Weight",
            meta: latestWeight
              ? `Recorded ${formatDisplayDate(latestWeight.measuredAt)}`
              : "No recent reading",
            value: formatWeight(latestWeight),
          },
          {
            href: `/portal/patients/${patientId}/health`,
            label: "eGFR",
            meta: "Latest clinical profile",
            value:
              typeof clinical?.egfrCurrent === "number"
                ? String(clinical.egfrCurrent)
                : "Not recorded",
          },
          {
            href: `/portal/patients/${patientId}/nutrition`,
            label: "Meal logging",
            meta: latestMealLog
              ? `Last log ${formatDisplayDate(latestMealLog.eatenAt)}`
              : "No recent meal logs",
            value: `${mealLoggingDays}/31 days`,
          },
        ],
        recentActivity,
        subheadline: `${
          typeof clinical?.egfrCurrent === "number" ? `eGFR ${clinical.egfrCurrent}` : "eGFR not recorded"
        } • ${
          mappedPatient.lastContactAt
            ? `last contact ${formatDisplayDate(mappedPatient.lastContactAt)}`
            : "no last-contact date"
        }`,
      },
      patient: mappedPatient,
    });
  } catch (error: any) {
    return bad(error?.message || "Unable to load portal patient", undefined, error?.status || 500);
  }
}
