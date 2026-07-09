export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, badFromError, ok } from "@/apps/api/lib/http/responses";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { updatePatientSymptom } from "@/apps/api/lib/utils/symptoms";
import { ROLES } from "@ckd/core";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ symptomId: string }> },
) {
  const requestId = makeRandomId();
  try {
    const caller = await requireUser(req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", { requestId }, 403);
    }

    const db = await getDb();
    const body = await req.json().catch(() => ({}));
    const { symptomId } = await context.params;
    const data = await updatePatientSymptom(db, caller, symptomId, body);
    return ok({ ...data, requestId });
  } catch (err: any) {
    return badFromError(
      {
        code: err?.code,
        errors: { issues: err?.issues, requestId },
        message: err?.message,
        status: err?.status,
      },
      "Server error",
    );
  }
}
