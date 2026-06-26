export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { getActivePatientWorseningTrendAlerts } from "@/apps/api/lib/utils/worseningTrends";

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
    const items = await getActivePatientWorseningTrendAlerts(db, {
      patientId: new ObjectId(caller.patientId),
    });

    return ok({ items });
  } catch (error: any) {
    console.error("[worsening-trends/active] failed", {
      message: error?.message ?? "unknown error",
      stack: error?.stack ?? null,
    });
    return bad(
      error?.message || "Unable to load worsening trends",
      undefined,
      error?.status || 500,
    );
  }
}
