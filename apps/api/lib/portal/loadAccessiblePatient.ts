import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad } from "@/apps/api/lib/http/responses";
import {
  buildPortalPatientAccessMatch,
  buildPortalPatientDetailPipeline,
  type RawPortalPatientDetailDoc,
} from "@/apps/api/lib/portal/patients";
import { COLLECTIONS } from "@ckd/core/server";

export async function loadAccessiblePortalPatient(
  req: NextRequest,
  patientId: string,
) {
  const caller = await requireUser(req);
  if (caller.role === "patient") {
    return {
      caller,
      error: bad(
        "Portal staff session required",
        { code: "portal_staff_required" },
        403,
      ),
      patient: null,
      patientObjectId: null,
    };
  }

  if (!ObjectId.isValid(patientId)) {
    return {
      caller,
      error: bad("Invalid patient id", { code: "invalid_patient_id" }, 400),
      patient: null,
      patientObjectId: null,
    };
  }

  const db = await getDb();
  const patientObjectId = new ObjectId(patientId);
  const patient = await db
    .collection(COLLECTIONS.Patients)
    .aggregate<RawPortalPatientDetailDoc>(
      buildPortalPatientDetailPipeline({
        ...buildPortalPatientAccessMatch(caller),
        _id: patientObjectId,
      }),
    )
    .next();

  if (!patient) {
    return {
      caller,
      error: bad("Patient not found", { code: "patient_not_found" }, 404),
      patient: null,
      patientObjectId: null,
    };
  }

  return { caller, db, error: null, patient, patientObjectId };
}
