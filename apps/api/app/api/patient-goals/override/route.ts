export const runtime = "nodejs";

import { NextRequest } from "next/server";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { applyCareTeamGoalOverride } from "@/apps/api/lib/utils/patientGoals";
import { ROLES } from "@ckd/core";

export async function PATCH(req: NextRequest) {
  const requestId = makeRandomId();
  try {
    const caller = await requireUser(req);
    if (
      caller.role !== ROLES.Clinician &&
      caller.role !== ROLES.Dietitian &&
      caller.role !== "admin"
    ) {
      return bad("Care team context required", { requestId }, 403);
    }

    const db = await getDb();
    const body = await req.json().catch(() => ({}));
    const current = await applyCareTeamGoalOverride(db, caller, body);
    return ok({ current, requestId });
  } catch (err: any) {
    return bad(
      err?.message || "Server error",
      { issues: err?.issues, requestId },
      err?.status || 500,
    );
  }
}
