export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, badFromError, ok } from "@/apps/api/lib/http/responses";
import { makeRandomId } from "@/apps/api/lib/http/request";
import {
  createPatientSymptom,
  listPatientSymptoms,
} from "@/apps/api/lib/utils/symptoms";
import { ROLES } from "@ckd/core";

export async function GET(req: NextRequest) {
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
    const data = await listPatientSymptoms(db, new ObjectId(caller.patientId));
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

export async function POST(req: NextRequest) {
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
    const data = await createPatientSymptom(db, caller, body);
    return ok({ ...data, requestId }, 201);
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
