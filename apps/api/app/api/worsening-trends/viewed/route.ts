export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, badFromError, ok } from "@/apps/api/lib/http/responses";
import { PatientWorseningTrendViewedRequest } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (
      caller.role !== "patient" ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient session required", { code: "patient_session_required" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = PatientWorseningTrendViewedRequest.safeParse(body);
    if (!parsed.success) {
      return bad("Invalid worsening trend viewed payload", parsed.error.flatten(), 400);
    }

    const { alertId, key } = parsed.data;
    const patientId = new ObjectId(caller.patientId);
    const now = new Date();
    const db = await getDb();

    await db.collection(COLLECTIONS.WorseningTrendStates).updateOne(
      {
        episodeId: alertId,
        key,
        patientId,
        status: "active",
      },
      {
        $set: {
          updatedAt: now,
          viewedAt: now,
        },
      },
    );

    return ok({
      alertId,
      key,
      viewedAt: now.toISOString(),
    });
  } catch (error: any) {
    return badFromError(error, "Unable to mark worsening trend as viewed");
  }
}
