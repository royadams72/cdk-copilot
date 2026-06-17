export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import type { PortalPatientCarePlanData } from "@/apps/api/lib/portal/patient-shared";
import {
  buildPortalPatientAccessMatch,
  mapPortalPatientDetail,
} from "@/apps/api/lib/portal/patients";
import { COLLECTIONS } from "@ckd/core/server";

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

type CarePlanDoc = {
  _id: ObjectId;
  activatedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  goals?: Array<{ key: string; label: string }>;
  notes?: string | null;
  sources?: Array<"manual" | "ai" | "template">;
  status: "draft" | "active" | "completed" | "archived";
  tasks?: Array<{
    freq: "daily" | "weekly" | "once";
    key: string;
    label: string;
    status: "open" | "paused" | "done";
  }>;
  title: string;
  updatedAt: Date;
};

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function statusWeight(status: CarePlanDoc["status"]) {
  switch (status) {
    case "active":
      return 0;
    case "draft":
      return 1;
    case "completed":
      return 2;
    case "archived":
      return 3;
    default:
      return 9;
  }
}

function isReviewDue(plan: CarePlanDoc) {
  if (plan.status !== "active") return false;
  const ageMs = Date.now() - plan.updatedAt.getTime();
  return ageMs > 1000 * 60 * 60 * 24 * 28;
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

    const carePlans = await db
      .collection<CarePlanDoc>(COLLECTIONS.CarePlans)
      .find(
        { patientId: patientObjectId },
        {
          projection: {
            _id: 1,
            activatedAt: 1,
            completedAt: 1,
            createdAt: 1,
            goals: 1,
            notes: 1,
            sources: 1,
            status: 1,
            tasks: 1,
            title: 1,
            updatedAt: 1,
          },
        },
      )
      .toArray();

    const rows = carePlans
      .slice()
      .sort((left, right) => {
        const byStatus = statusWeight(left.status) - statusWeight(right.status);
        if (byStatus !== 0) return byStatus;
        return right.updatedAt.getTime() - left.updatedAt.getTime();
      })
      .map((plan) => ({
        activatedAt: toIso(plan.activatedAt),
        completedAt: toIso(plan.completedAt),
        goalsCount: plan.goals?.length ?? 0,
        id: plan._id.toHexString(),
        notes: plan.notes?.trim() || null,
        openTasksCount:
          plan.tasks?.filter((task) => task.status === "open").length ?? 0,
        sources: plan.sources ?? [],
        status: plan.status,
        tasksCount: plan.tasks?.length ?? 0,
        title: plan.title,
        updatedAt: plan.updatedAt.toISOString(),
      }));

    const mappedPatient = mapPortalPatientDetail(patient);
    const reviewDueCount = carePlans.filter(isReviewDue).length;

    const data: PortalPatientCarePlanData = {
      headline: `Care Plans ${mappedPatient.name}`,
      patient: mappedPatient,
      rows,
      summary: {
        activeCount: carePlans.filter((plan) => plan.status === "active").length,
        completedCount: carePlans.filter((plan) => plan.status === "completed")
          .length,
        draftCount: carePlans.filter((plan) => plan.status === "draft").length,
        reviewDueCount,
        totalCount: carePlans.length,
      },
    };

    return ok(data);
  } catch (error: any) {
    return bad(
      error?.message || "Unable to load care plans",
      undefined,
      error?.status || 500,
    );
  }
}
