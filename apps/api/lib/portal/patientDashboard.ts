import { formatDisplayDate } from "@/apps/api/lib/format/date";
import type {
  PortalPatientAttentionItem,
  PortalPatientDashboardData,
  PortalPatientDetail,
} from "@/apps/api/lib/portal/patient-shared";
import { COLLECTIONS } from "@ckd/core/server";
import { ObjectId, type Db } from "mongodb";

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
  type: string;
  at: Date;
  key: string;
  note?: string | null;
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

type PatientDashboardQueryResult = {
  carePlans: CarePlanDoc[];
  clinical: PortalPatientSummaryClinicalDoc | null;
  measurementDocs: MeasurementDoc[];
  nutritionDocs: NutritionDoc[];
};

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function countDistinctDays(values: Date[]) {
  return new Set(values.map(dateKey)).size;
}

function latestByDate<T>(
  items: T[],
  getDate: (item: T) => Date | null | undefined,
) {
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
  const average = (
    docs: MeasurementDoc[],
    key: "systolicMmHg" | "diastolicMmHg",
  ) => docs.reduce((sum, doc) => sum + (doc[key] ?? 0), 0) / docs.length;

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
  if (
    typeof doc.systolicMmHg !== "number" ||
    typeof doc.diastolicMmHg !== "number"
  ) {
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

function buildAttentionItems(input: {
  activeCarePlan: CarePlanDoc | null;
  activeCarePlanCount: number;
  bloodPressureLoggingDays: number;
  latestBloodPressure: MeasurementDoc | null;
  latestWeight: MeasurementDoc | null;
  mealLoggingDays: number;
  patientId: string;
  weightLoggingDays: number;
  daysSinceLastContact: number | null;
  reviewDueCount: number;
}): PortalPatientAttentionItem[] {
  const items: PortalPatientAttentionItem[] = [];

  if (input.activeCarePlanCount === 0) {
    items.push({
      detail: "There is no active care plan for this patient.",
      href: `/portal/patients/${input.patientId}/care-plans`,
      title: "No active care plan",
      tone: "warning",
    });
  }

  if (input.reviewDueCount > 0) {
    items.push({
      detail: `${input.reviewDueCount} active care plan${input.reviewDueCount === 1 ? "" : "s"} should be reviewed.`,
      href: `/portal/patients/${input.patientId}/care-plans`,
      title: "Care plan review due",
      tone: "warning",
    });
  }

  if (
    !input.latestBloodPressure ||
    Date.now() - input.latestBloodPressure.measuredAt.getTime() > 14 * DAY_MS
  ) {
    items.push({
      detail: "No blood pressure reading has been logged in the last 14 days.",
      href: `/portal/patients/${input.patientId}/health`,
      title: "Missing recent blood pressure data",
      tone: "warning",
    });
  }

  if (
    !input.latestWeight ||
    Date.now() - input.latestWeight.measuredAt.getTime() > 14 * DAY_MS
  ) {
    items.push({
      detail: "No weight reading has been logged in the last 14 days.",
      href: `/portal/patients/${input.patientId}/health`,
      title: "Missing recent weight data",
      tone: "warning",
    });
  }

  if (input.daysSinceLastContact !== null && input.daysSinceLastContact >= 14) {
    items.push({
      detail: `Last contact was ${input.daysSinceLastContact} day${input.daysSinceLastContact === 1 ? "" : "s"} ago.`,
      href: `/portal/patients/${input.patientId}/nutrition`,
      title: "Patient may be disengaged",
      tone: "warning",
    });
  }

  if (
    input.activeCarePlan &&
    (input.activeCarePlan.tasks?.filter((task) => task.status === "open")
      .length ?? 0) > 0 &&
    input.mealLoggingDays === 0 &&
    input.bloodPressureLoggingDays === 0 &&
    input.weightLoggingDays === 0
  ) {
    items.push({
      detail:
        "An active care plan exists, but there has been no nutrition, blood pressure or weight data in the last 31 days.",
      href: `/portal/patients/${input.patientId}/health`,
      title: "Active plan with no recent patient data",
      tone: "warning",
    });
  }

  if (
    input.latestBloodPressure &&
    ((input.latestBloodPressure.systolicMmHg ?? 0) >= 140 ||
      (input.latestBloodPressure.diastolicMmHg ?? 0) >= 90)
  ) {
    items.push({
      detail: `${formatBloodPressure(input.latestBloodPressure)} on ${formatDisplayDate(
        input.latestBloodPressure.measuredAt,
      )}.`,
      href: `/portal/patients/${input.patientId}/health`,
      title: "Latest blood pressure above target",
      tone: "warning",
    });
  }

  if (items.length === 0) {
    items.push({
      detail: "Nothing urgent is flagged on the overview right now.",
      title: "No urgent issues",
      tone: "success",
    });
  }

  return items;
}

function buildRecentActivity(input: {
  latestBloodPressure: MeasurementDoc | null;
  latestCarePlan: CarePlanDoc | null;
  latestMealLog: NutritionDoc | null;
  latestWeight: MeasurementDoc | null;
}) {
  const { latestBloodPressure, latestCarePlan, latestMealLog, latestWeight } =
    input;

  return [
    ...(latestCarePlan?.activity ?? []).map((event) => {
      const planTitle = latestCarePlan?.title ?? "Care plan";
      return {
        id: `care-plan-${event.key}`,
        at: event.at.toISOString(),
        detail: event.note?.trim()
          ? `${planTitle}: ${event.note.trim()}`
          : planTitle,
        label: getCarePlanActivityLabel(event.type),
      };
    }),
    ...(latestBloodPressure
      ? [
          {
            id: `bp-${latestBloodPressure.measuredAt.toISOString()}`,
            at: latestBloodPressure.measuredAt.toISOString(),
            detail: formatBloodPressure(latestBloodPressure),
            label: "Blood pressure logged",
          },
        ]
      : []),
    ...(latestWeight
      ? [
          {
            id: `weight-${latestWeight.measuredAt.toISOString()}`,
            at: latestWeight.measuredAt.toISOString(),
            detail: formatWeight(latestWeight),
            label: "Weight logged",
          },
        ]
      : []),
    ...(latestMealLog
      ? [
          {
            id: `meal-${latestMealLog.eatenAt.toISOString()}`,
            at: latestMealLog.eatenAt.toISOString(),
            detail: "Nutrition data logged",
            label: "Meal logged",
          },
        ]
      : []),
  ]
    .sort(
      (left, right) =>
        new Date(right.at).getTime() - new Date(left.at).getTime(),
    )
    .slice(0, 5);
}

function buildCarePlanSnapshot(input: {
  activeCarePlan: CarePlanDoc | null;
  latestCarePlan: CarePlanDoc | null;
  patientId: string;
}) {
  const carePlan = input.activeCarePlan ?? input.latestCarePlan;
  if (!carePlan) {
    return null;
  }

  return {
    href: `/portal/patients/${input.patientId}/care-plans/${carePlan._id.toHexString()}`,
    nextReviewAt: getNextReviewAt(carePlan)?.toISOString() ?? null,
    openTasksLabel: `${
      carePlan.tasks?.filter((task) => task.status === "open").length ?? 0
    } open tasks`,
    reviewLabel: carePlan.reviewLabel?.trim() || null,
    status:
      carePlan === input.activeCarePlan
        ? "Active"
        : carePlan.status.charAt(0).toUpperCase() + carePlan.status.slice(1),
    title: carePlan.title,
    updatedAt: carePlan.updatedAt.toISOString(),
  };
}

export async function loadPortalPatientDashboardQueryResult(
  db: Db,
  patientObjectId: ObjectId,
) {
  const windowStart = new Date(Date.now() - 31 * DAY_MS);

  const [clinical, nutritionDocs, measurementDocs, carePlans] =
    await Promise.all([
      db
        .collection<PortalPatientSummaryClinicalDoc>(COLLECTIONS.UsersClinical)
        .findOne(
          { patientId: patientObjectId },
          { projection: { _id: 0, egfrCurrent: 1, medications: 1 } },
        ),
      db
        .collection<NutritionDoc>(COLLECTIONS.NutritionLedger)
        .find(
          { eatenAt: { $gte: windowStart }, patientId: patientObjectId },
          { projection: { _id: 0, eatenAt: 1, totals: 1 } },
        )
        .toArray(),
      db
        .collection<MeasurementDoc>(COLLECTIONS.MeasurementsLedger)
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
      db
        .collection<CarePlanDoc>(COLLECTIONS.CarePlans)
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

  return {
    carePlans,
    clinical,
    measurementDocs,
    nutritionDocs,
  } satisfies PatientDashboardQueryResult;
}

export function buildPortalPatientDashboard(input: {
  patient: PortalPatientDetail;
  patientId: string;
  queryResult: PatientDashboardQueryResult;
}): PortalPatientDashboardData {
  const { clinical, nutritionDocs, measurementDocs, carePlans } =
    input.queryResult;
  const weightDocs = measurementDocs.filter((doc) => doc.kind === "weight");
  const bloodPressureDocs = measurementDocs.filter(
    (doc) => doc.kind === "blood_pressure",
  );
  const latestBloodPressure = latestByDate(
    bloodPressureDocs,
    (doc) => doc.measuredAt,
  );
  const latestWeight = latestByDate(weightDocs, (doc) => doc.measuredAt);
  const latestMealLog = latestByDate(nutritionDocs, (doc) => doc.eatenAt);
  const activeCarePlan = latestByDate(
    carePlans.filter((plan) => plan.status === "active"),
    (plan) => plan.updatedAt,
  );
  const latestCarePlan = latestByDate(carePlans, (plan) => plan.updatedAt);
  const mealLoggingDays = countDistinctDays(
    nutritionDocs.map((doc) => doc.eatenAt),
  );
  const bloodPressureLoggingDays = countDistinctDays(
    bloodPressureDocs.map((doc) => doc.measuredAt),
  );
  const weightLoggingDays = countDistinctDays(
    weightDocs.map((doc) => doc.measuredAt),
  );
  const activeCarePlanCount = carePlans.filter(
    (plan) => plan.status === "active",
  ).length;
  const reviewDueCount = carePlans.filter(isReviewDue).length;
  const daysSinceLastContact = input.patient.lastContactAt
    ? Math.floor(
        (Date.now() - new Date(input.patient.lastContactAt).getTime()) / DAY_MS,
      )
    : null;

  return {
    actionCards: [
      "Nutrition Data",
      "Health Data",
      "Labs",
      "Care Plans",
      "Worsening Trends",
      "Patient targets",
      "Medication Profile",
      "Nutrition Profile",
      "Diagnoses",
      "Messaging",
      "Reviewed Trends",
    ],
    attentionItems: buildAttentionItems({
      activeCarePlan,
      activeCarePlanCount,
      bloodPressureLoggingDays,
      daysSinceLastContact,
      latestBloodPressure,
      latestWeight,
      mealLoggingDays,
      patientId: input.patientId,
      reviewDueCount,
      weightLoggingDays,
    }),
    carePlanSnapshot: buildCarePlanSnapshot({
      activeCarePlan,
      latestCarePlan,
      patientId: input.patientId,
    }),
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
      { label: "CKD stage", value: input.patient.stage ?? "Not recorded" },
      { label: "Risk", value: getRiskLabel(input.patient.risk) },
      {
        href: `/portal/patients/${input.patientId}/care-plans`,
        label: "Active care plans",
        value: String(activeCarePlanCount),
      },
      {
        href: `/portal/patients/${input.patientId}/medication`,
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
    headline: `Viewing ${input.patient.name}`,
    latestReadings: [
      {
        href: `/portal/patients/${input.patientId}/health`,
        label: "Blood pressure",
        meta: latestBloodPressure
          ? `Recorded ${formatDisplayDate(latestBloodPressure.measuredAt)}`
          : "No recent reading",
        value: formatBloodPressure(latestBloodPressure),
      },
      {
        href: `/portal/patients/${input.patientId}/health`,
        label: "Weight",
        meta: latestWeight
          ? `Recorded ${formatDisplayDate(latestWeight.measuredAt)}`
          : "No recent reading",
        value: formatWeight(latestWeight),
      },
      {
        href: `/portal/patients/${input.patientId}/labs`,
        label: "eGFR",
        meta: "Latest clinical profile",
        value:
          typeof clinical?.egfrCurrent === "number"
            ? String(clinical.egfrCurrent)
            : "Not recorded",
      },
      {
        href: `/portal/patients/${input.patientId}/nutrition`,
        label: "Meal logging",
        meta: latestMealLog
          ? `Last log ${formatDisplayDate(latestMealLog.eatenAt)}`
          : "No recent meal logs",
        value: `${mealLoggingDays}/31 days`,
      },
    ],
    recentActivity: buildRecentActivity({
      latestBloodPressure,
      latestCarePlan,
      latestMealLog,
      latestWeight,
    }),
    subheadline: `${
      typeof clinical?.egfrCurrent === "number"
        ? `eGFR ${clinical.egfrCurrent}`
        : "eGFR not recorded"
    } • ${
      input.patient.lastContactAt
        ? `last contact ${formatDisplayDate(input.patient.lastContactAt)}`
        : "no last-contact date"
    }`,
  };
}
