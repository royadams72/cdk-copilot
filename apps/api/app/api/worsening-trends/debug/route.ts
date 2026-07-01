export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { getActivePatientWorseningTrendAlerts } from "@/apps/api/lib/utils/worseningTrends";
import { COLLECTIONS } from "@ckd/core/server";

export async function GET(req: NextRequest) {
  try {
    if (process.env.NODE_ENV === "production") {
      return bad("Not found", { code: "not_found" }, 404);
    }

    const caller = await requireUser(req);
    if (caller.role !== "patient" || !caller.patientId) {
      return bad("Patient session required", { code: "patient_session_required" }, 403);
    }

    if (!ObjectId.isValid(caller.patientId)) {
      return bad("Invalid patient id", { code: "invalid_patient_id" }, 400);
    }

    const patientId = new ObjectId(caller.patientId);
    const db = await getDb();
    const [activeAlerts, states, snapshots, checkIns] = await Promise.all([
      getActivePatientWorseningTrendAlerts(db, { patientId }),
      db
        .collection(COLLECTIONS.WorseningTrendStates)
        .find({ patientId }, { projection: { _id: 0 } })
        .sort({ updatedAt: -1 })
        .toArray(),
      db
        .collection(COLLECTIONS.WorseningTrendSnapshots)
        .find({ patientId }, { projection: { _id: 0 } })
        .sort({ updatedAt: -1 })
        .toArray(),
      db
        .collection(COLLECTIONS.WorseningTrendCheckIns)
        .find({ patientId }, { projection: { _id: 0 } })
        .sort({ updatedAt: -1 })
        .limit(20)
        .toArray(),
    ]);

    return ok({
      activeAlerts,
      checkIns,
      snapshots,
      states,
    });
  } catch (error: any) {
    return bad(
      error?.message || "Unable to load worsening trend debug snapshot",
      undefined,
      error?.status || 500,
    );
  }
}
