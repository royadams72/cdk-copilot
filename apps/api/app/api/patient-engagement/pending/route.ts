export const runtime = "nodejs";

import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  getPendingPatientEngagement,
  serializePendingPatientEngagement,
} from "@/apps/api/lib/utils/patientEngagement";
import { ROLES } from "@ckd/core";

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }

    const db = await getDb();
    const achievement = await getPendingPatientEngagement(
      db,
      new ObjectId(caller.patientId),
    );

    return ok({ achievement: serializePendingPatientEngagement(achievement) });
  } catch (err: any) {
    return bad(err?.message || "Server error", undefined, err?.status || 500);
  }
}
