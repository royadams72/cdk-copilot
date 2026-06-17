export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { COLLECTIONS } from "@ckd/core/server";

type CarePlanTaskDoc = {
  freq: "daily" | "weekly" | "once";
  key: string;
  label: string;
  status: "open" | "paused" | "done";
};

type CarePlanDoc = {
  _id: ObjectId;
  activatedAt?: Date | null;
  createdAt: Date;
  patientId: ObjectId;
  reviewLabel?: string | null;
  status: "draft" | "active" | "completed" | "archived";
  tasks?: CarePlanTaskDoc[];
  title: string;
  updatedAt: Date;
};

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (caller.role !== "patient" || !caller.patientId) {
      return bad("Patient session required", { code: "patient_session_required" }, 403);
    }

    if (!ObjectId.isValid(caller.patientId)) {
      return bad("Invalid patient id", { code: "invalid_patient_id" }, 400);
    }

    const db = await getDb();
    const patientObjectId = new ObjectId(caller.patientId);
    const plans = await db
      .collection<CarePlanDoc>(COLLECTIONS.CarePlans)
      .find(
        {
          patientId: patientObjectId,
          status: { $in: ["active", "completed", "draft"] },
        },
        {
          projection: {
            _id: 1,
            activatedAt: 1,
            createdAt: 1,
            patientId: 1,
            reviewLabel: 1,
            status: 1,
            tasks: 1,
            title: 1,
            updatedAt: 1,
          },
          sort: { updatedAt: -1 },
        },
      )
      .toArray();

    const items = plans.map((plan) => ({
      activatedAt: plan.activatedAt?.toISOString() ?? null,
      id: plan._id.toHexString(),
      reviewLabel: plan.reviewLabel?.trim() || null,
      status: plan.status,
      taskCount: (plan.tasks ?? []).filter((task) => task.status !== "done").length,
      title: plan.title,
      updatedAt: plan.updatedAt.toISOString(),
    }));

    const latestActivePlan =
      items.find((plan) => plan.status === "active") ?? items[0] ?? null;

    return ok({
      items,
      latestActivePlan,
      latestUpdatedAt: items[0]?.updatedAt ?? null,
    });
  } catch (error: any) {
    return bad(
      error?.message || "Unable to load care plans",
      undefined,
      error?.status || 500,
    );
  }
}
