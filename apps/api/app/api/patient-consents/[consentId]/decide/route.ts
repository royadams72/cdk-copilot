import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { makeRandomId } from "@/apps/api/lib/http/request";

import { PatientConsentDecisionRequest, TPatientConsent } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

type PatientConsentDoc = Omit<TPatientConsent, "_id" | "patientId"> & {
  _id: ObjectId;
  patientId: ObjectId;
};

type PatientDoc = {
  _id: ObjectId;
};

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ consentId: string }> },
) {
  const requestId = makeRandomId();

  try {
    const caller = await requireUser(req);

    if (!caller.patientId || !ObjectId.isValid(caller.patientId)) {
      return bad("Patient context missing", { requestId }, 403);
    }

    const { consentId } = await ctx.params;
    if (!ObjectId.isValid(consentId)) {
      return bad("Invalid consent id", { requestId }, 400);
    }

    const body = await req.json().catch(() => null);
    const parsed = PatientConsentDecisionRequest.safeParse(body);
    if (!parsed.success) {
      return bad("Validation failed", { requestId }, 400);
    }

    const db = await getDb();
    const consents = db.collection<PatientConsentDoc>(COLLECTIONS.PatientConsents);
    const patients = db.collection<PatientDoc>(COLLECTIONS.Patients);
    const patientObjectId = new ObjectId(caller.patientId);
    const consentObjectId = new ObjectId(consentId);
    const now = new Date();

    const consent = await consents.findOne({
      _id: consentObjectId,
      patientId: patientObjectId,
      status: "pending",
    });

    if (!consent) {
      return bad("Consent not found", { requestId }, 404);
    }

    const nextStatus =
      parsed.data.decision === "agree" ? "accepted" : "declined";

    await consents.updateOne(
      { _id: consentObjectId },
      {
        $set: {
          decision: parsed.data.decision,
          decisionSource: parsed.data.decisionSource ?? "in_app",
          decidedAt: now.toISOString(),
          status: nextStatus,
          updatedAt: now.toISOString(),
          updatedBy: caller.principalId,
        },
      },
    );

    if (parsed.data.decision === "agree") {
      await patients.updateOne(
        {
          _id: patientObjectId,
          "assignments.assignmentId": consent.assignmentId,
        },
        {
          $set: {
            "assignments.$.consentStatus": "accepted",
            "assignments.$.status": "active",
            "assignments.$.updatedAt": now.toISOString(),
            updatedAt: now,
          },
        },
      );
    } else if (consent.type !== "clinician_added") {
      await patients.updateOne(
        {
          _id: patientObjectId,
          "assignments.assignmentId": consent.assignmentId,
        },
        {
          $set: {
            "assignments.$.consentStatus": "declined",
            "assignments.$.status": "inactive",
            "assignments.$.updatedAt": now.toISOString(),
            updatedAt: now,
          },
        },
      );
    }

    return ok(
      {
        consentId,
        decision: parsed.data.decision,
        requestId,
        status: nextStatus,
      },
      200,
    );
  } catch (error: any) {
    const status = error?.status || 500;
    return bad(error?.message || "Server error", { requestId }, status);
  }
}
