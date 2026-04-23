export const runtime = "nodejs";

import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { getSleepReminderStatus } from "@/apps/api/lib/utils/sleep";
import { ROLES } from "@ckd/core";

export async function GET(_req: NextRequest) {
  try {
    const caller = await requireUser(_req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }

    const db = await getDb();
    const status = await getSleepReminderStatus(db, new ObjectId(caller.patientId));
    return ok(status);
  } catch (err: any) {
    return bad(err?.message || "Server error", undefined, err?.status || 500);
  }
}
