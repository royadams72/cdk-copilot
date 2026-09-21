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
    const caller = await requireUser(req, [], {
      allowPendingMembership: true,
    });

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
            noticeVersion: 1,
            purpose: 1,
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

    const facilityIds = [...new Set(docs.map((doc) => doc.facilityId))];
    const careTeamIds = [...new Set(docs.map((doc) => doc.careTeamId))];
    const orgIds = [...new Set(docs.map((doc) => doc.orgId))];
    const clinicianIds = docs.flatMap((doc) =>
      doc.clinicianPrincipalId ? [doc.clinicianPrincipalId] : [],
    );
    const [facilities, careTeams, orgs, clinicians] = await Promise.all([
      db.collection(COLLECTIONS.Facilities)
        .find({ facilityId: { $in: facilityIds } })
        .project<{ facilityId: string; name?: string }>({ _id: 0, facilityId: 1, name: 1 })
        .toArray(),
      db.collection(COLLECTIONS.CareTeams)
        .find({ $or: [{ careTeamId: { $in: careTeamIds } }, { slug: { $in: careTeamIds } }] })
        .project<{ careTeamId?: string; name?: string; slug?: string }>({ _id: 0, careTeamId: 1, name: 1, slug: 1 })
        .toArray(),
      db.collection(COLLECTIONS.Orgs)
        .find({ $or: [{ orgId: { $in: orgIds } }, { slug: { $in: orgIds } }] })
        .project<{ name?: string; orgId?: string; slug?: string }>({ _id: 0, name: 1, orgId: 1, slug: 1 })
        .toArray(),
      db.collection(COLLECTIONS.UsersStaff)
        .find({ principalId: { $in: clinicianIds } })
        .project<{ displayName?: string; firstName?: string; lastName?: string; principalId: string }>({ _id: 0, displayName: 1, firstName: 1, lastName: 1, principalId: 1 })
        .toArray(),
    ]);
    const facilityNames = new Map(facilities.map((item) => [item.facilityId, item.name]));
    const careTeamNames = new Map(careTeams.map((item) => [item.careTeamId ?? item.slug, item.name]));
    const orgNames = new Map(orgs.map((item) => [item.orgId ?? item.slug, item.name]));
    const clinicianNames = new Map(
      clinicians.map((item) => [
        item.principalId,
        item.displayName?.trim() ||
          [item.firstName, item.lastName].filter(Boolean).join(" ") ||
          "A clinician from your care team",
      ]),
    );

    return ok({
      items: docs.map((doc) => ({
        ...doc,
        _id: String(doc._id),
        careTeamName: careTeamNames.get(doc.careTeamId) ?? "Your care team",
        clinicianName: doc.clinicianPrincipalId
          ? clinicianNames.get(doc.clinicianPrincipalId) ??
            "A clinician from your care team"
          : undefined,
        facilityName: facilityNames.get(doc.facilityId) ?? "Your care service",
        orgName: orgNames.get(doc.orgId) ?? "Your care organisation",
        patientId: String(doc.patientId),
      })),
      requestId,
    });
  } catch (error: any) {
    const status = error?.status || 500;
    return bad(error?.message || "Server error", { requestId }, status);
  }
}
