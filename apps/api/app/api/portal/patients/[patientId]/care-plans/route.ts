export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import type { CarePlanMongoDoc } from "@/apps/api/lib/care-plans/shared";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { toIsoDate } from "@/apps/api/lib/format/date";
import { bad, ok } from "@/apps/api/lib/http/responses";
import type { PortalPatientCarePlanData } from "@/apps/api/lib/portal/patient-shared";
import {
  buildPortalPatientDetailPipeline,
  buildPortalPatientAccessMatch,
  mapPortalPatientDetail,
  type RawPortalPatientDetailDoc,
} from "@/apps/api/lib/portal/patients";
import { COLLECTIONS } from "@ckd/core/server";

function statusWeight(status: CarePlanMongoDoc["status"]) {
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

function isReviewDue(plan: CarePlanMongoDoc) {
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

    const carePlans = await db
      .collection<CarePlanMongoDoc>(COLLECTIONS.CarePlans)
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
        activatedAt: toIsoDate(plan.activatedAt),
        completedAt: toIsoDate(plan.completedAt),
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
