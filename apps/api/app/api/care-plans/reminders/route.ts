export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { COLLECTIONS } from "@ckd/core/server";

type CarePlanTaskDoc = {
  freq: "daily" | "weekly" | "once";
  instructions?: string;
  key: string;
  label: string;
  status: "open" | "paused" | "done";
};

type CarePlanDoc = {
  _id: ObjectId;
  activatedAt?: Date | null;
  patientId: ObjectId;
  status: "draft" | "active" | "completed" | "archived";
  tasks?: CarePlanTaskDoc[];
  title: string;
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
    const plans = await db
      .collection<CarePlanDoc>(COLLECTIONS.CarePlans)
      .find(
        {
          patientId: new ObjectId(caller.patientId),
          status: "active",
        },
        {
          projection: {
            _id: 1,
            activatedAt: 1,
            patientId: 1,
            status: 1,
            tasks: 1,
            title: 1,
          },
        },
      )
      .toArray();

    return ok({
      items: plans.flatMap((plan) =>
        (plan.tasks ?? [])
          .filter((task) => task.status === "open")
          .map((task) => ({
            activatedAt: plan.activatedAt?.toISOString() ?? null,
            freq: task.freq,
            instructions: task.instructions?.trim() || null,
            planId: plan._id.toHexString(),
            planTitle: plan.title,
            taskId: task.key,
            taskLabel: task.label,
          })),
      ),
    });
  } catch (error: any) {
    return bad(
      error?.message || "Unable to load care plan reminders",
      undefined,
      error?.status || 500,
    );
  }
}
