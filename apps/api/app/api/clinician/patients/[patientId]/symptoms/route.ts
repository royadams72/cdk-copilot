export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { buildPatientAccessFilter } from "@/apps/api/lib/auth/patientAccess";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { buildClinicianSymptomResponse } from "@/apps/api/lib/utils/symptoms";
import { ROLES, SCOPES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

async function callerCanAccessPatient(req: NextRequest, patientId: ObjectId) {
  const caller = await requireUser(req, SCOPES.USERS_CLINICAL_READ);
  if (
    caller.role !== ROLES.Clinician &&
    caller.role !== ROLES.Dietitian &&
    caller.role !== "admin"
  ) {
    throw Object.assign(new Error("Care team context required"), { status: 403 });
  }

  const db = await getDb();
  if (caller.role === "admin") {
    const patient = await db
      .collection(COLLECTIONS.Patients)
      .findOne({ _id: patientId }, { projection: { _id: 1 } });
    return { caller, exists: Boolean(patient) };
  }

  const patient = await db.collection(COLLECTIONS.Patients).findOne({
    _id: patientId,
    ...buildPatientAccessFilter(caller),
  });
  return { caller, exists: Boolean(patient) };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ patientId: string }> },
) {
  const requestId = makeRandomId();
  try {
    const { patientId } = await context.params;
    if (!ObjectId.isValid(patientId)) {
      return bad("Invalid patient id", { requestId }, 400);
    }

    const patientObjectId = new ObjectId(patientId);
    const access = await callerCanAccessPatient(req, patientObjectId);
    if (!access.exists) {
      return bad("Patient not found", { requestId }, 404);
    }

    const db = await getDb();
    const data = await buildClinicianSymptomResponse(db, patientObjectId);
    return ok({ ...data, requestId });
  } catch (err: any) {
    return bad(
      err?.message || "Server error",
      { issues: err?.issues, requestId },
      err?.status || 500,
    );
  }
}
