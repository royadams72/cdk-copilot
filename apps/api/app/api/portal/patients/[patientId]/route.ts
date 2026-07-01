export const runtime = "nodejs";

import { NextRequest } from "next/server";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  buildPortalPatientDashboard,
  loadPortalPatientDashboardQueryResult,
} from "@/apps/api/lib/portal/patientDashboard";
import {
  buildPortalPatientAccessMatch,
  buildPortalPatientDetailPipeline,
  mapPortalPatientDetail,
  type RawPortalPatientDetailDoc,
} from "@/apps/api/lib/portal/patients";
import { COLLECTIONS } from "@ckd/core/server";
import { ObjectId } from "mongodb";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ patientId: string }> },
) {
  try {
    const caller = await requireUser(req);
    if (caller.role === "patient") {
      return bad(
        "Portal staff session required",
        { code: "portal_staff_required" },
        403,
      );
    }

    const { patientId } = await context.params;
    if (!ObjectId.isValid(patientId)) {
      return bad("Invalid patient id", { code: "invalid_patient_id" }, 400);
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
      return bad("Patient not found", { code: "patient_not_found" }, 404);
    }

    const mappedPatient = mapPortalPatientDetail(patient);
    const queryResult = await loadPortalPatientDashboardQueryResult(
      db,
      patientObjectId,
    );

    return ok({
      dashboard: buildPortalPatientDashboard({
        patient: mappedPatient,
        patientId,
        queryResult,
      }),
      patient: mappedPatient,
    });
  } catch (error: any) {
    return bad(
      error?.message || "Unable to load portal patient",
      undefined,
      error?.status || 500,
    );
  }
}
