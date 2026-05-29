import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { makeRandomId } from "@/apps/api/lib/http/request";

import { TPatientConsent } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

type PatientConsentDoc = Omit<TPatientConsent, "_id" | "patientId"> & {
  _id: ObjectId;
  patientId: ObjectId;
};

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const requestId = makeRandomId();

  try {
    const caller = await requireUser(req);

    if (!caller.patientId || !ObjectId.isValid(caller.patientId)) {
      return bad("Patient context missing", { requestId }, 403);
    }

    const db = await getDb();
    const collection = db.collection<PatientConsentDoc>(COLLECTIONS.PatientConsents);
    const patientObjectId = new ObjectId(caller.patientId);

    const docs = await collection
      .find(
        {
          patientId: patientObjectId,
          status: "pending",
        },
        {
          projection: {
            assignmentId: 1,
            careTeamId: 1,
            clinicianPrincipalId: 1,
            copy: 1,
            createdAt: 1,
            decision: 1,
            decisionSource: 1,
            decidedAt: 1,
            facilityId: 1,
            orgId: 1,
            patientId: 1,
            principalId: 1,
            requestedAt: 1,
            status: 1,
            type: 1,
            updatedAt: 1,
          },
          sort: { requestedAt: 1 },
        },
      )
      .toArray();

    return ok({
      items: docs.map((doc) => ({
        ...doc,
        _id: String(doc._id),
        patientId: String(doc.patientId),
      })),
      requestId,
    });
  } catch (error: any) {
    const status = error?.status || 500;
    return bad(error?.message || "Server error", { requestId }, status);
  }
}
