export const runtime = "nodejs";

import { NextRequest } from "next/server";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  buildPortalPatientAccessMatch,
  mapPortalPatientDetail,
} from "@/apps/api/lib/portal/patients";
import { COLLECTIONS } from "@ckd/core/server";
import { ObjectId } from "mongodb";

const DAY_MS = 24 * 60 * 60 * 1000;

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

type ClinicalDoc = {
  egfrCurrent?: number | null;
  medications?: Array<{ name?: string }>;
};

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function countDistinctDays(values: Date[]) {
  return new Set(values.map(dateKey)).size;
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

    const windowStart = new Date(Date.now() - 31 * DAY_MS);
    const [clinical, nutritionDocs, measurementDocs] = await Promise.all([
      db.collection<ClinicalDoc>(COLLECTIONS.UsersClinical).findOne(
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
    ]);

    const weightDocs = measurementDocs.filter((doc) => doc.kind === "weight");
    const bloodPressureDocs = measurementDocs.filter(
      (doc) => doc.kind === "blood_pressure",
    );
    const mealLoggingDays = countDistinctDays(nutritionDocs.map((doc) => doc.eatenAt));
    const bloodPressureLoggingDays = countDistinctDays(
      bloodPressureDocs.map((doc) => doc.measuredAt),
    );
    const weightLoggingDays = countDistinctDays(weightDocs.map((doc) => doc.measuredAt));

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
        headline: `Viewing ${mapPortalPatientDetail(patient).name} - eGFR stable - ${
          clinical?.egfrCurrent ?? "n/a"
        }`,
      },
      patient: mapPortalPatientDetail(patient),
    });
  } catch (error: any) {
    return bad(error?.message || "Unable to load portal patient", undefined, error?.status || 500);
  }
}
