import { randomBytes } from "crypto";

import { Db, Filter, ObjectId } from "mongodb";

import {
  TPatientAssignment,
  TPatientConsent,
} from "../../../../packages/core/src/isomorphic";
import { COLLECTIONS } from "../../../../packages/core/src/server";

type PatientAssignmentDoc = TPatientAssignment;

type PatientDoc = {
  _id: ObjectId;
  principalId?: string;
  assignments?: PatientAssignmentDoc[];
  updatedAt?: Date | string;
};

type PatientConsentDoc = Omit<TPatientConsent, "_id" | "patientId"> & {
  _id: ObjectId;
  patientId: ObjectId;
};

type QueueCareTeamConsentArgs = {
  actorPrincipalId: string;
  assignmentId?: string;
  careTeamId: string;
  clinicianPrincipalId?: string;
  facilityId: string;
  orgId: string;
  patientId: ObjectId | string;
  patientPrincipalId?: string;
};

export function buildCareTeamConsentCopy(args: {
  careTeamId: string;
  clinicianPrincipalId?: string;
}) {
  if (args.clinicianPrincipalId) {
    return {
      body: "A clinician has been added to your care team and needs your approval.",
      title: "Care team update",
    };
  }

  return {
    body: `You have been added to care team ${args.careTeamId}. Please review and approve this access request.`,
    title: "Care team access request",
  };
}

export async function queueCareTeamConsent(
  db: Db,
  args: QueueCareTeamConsentArgs,
) {
  const patients = db.collection<PatientDoc>(COLLECTIONS.Patients);
  const consents = db.collection<PatientConsentDoc>(COLLECTIONS.PatientConsents);
  const patientObjectId =
    args.patientId instanceof ObjectId
      ? args.patientId
      : new ObjectId(args.patientId);

  const patient = await patients.findOne(
    { _id: patientObjectId },
    { projection: { _id: 1, assignments: 1, principalId: 1 } },
  );

  if (!patient) {
    throw new Error("Patient not found");
  }

  const patientPrincipalId = args.patientPrincipalId ?? patient.principalId;
  if (!patientPrincipalId) {
    throw new Error("Patient principalId missing");
  }

  const assignmentId =
    args.assignmentId ?? `asg_${randomBytes(12).toString("hex")}`;
  const now = new Date();
  const nowIso = now.toISOString();
  const consentType: PatientConsentDoc["type"] = args.clinicianPrincipalId
    ? "clinician_added"
    : "care_team_added";

  const existingAssignment = patient.assignments?.find(
    (assignment) => assignment.assignmentId === assignmentId,
  );

  if (existingAssignment) {
    await patients.updateOne(
      {
        _id: patientObjectId,
        "assignments.assignmentId": assignmentId,
      },
      {
        $set: {
          "assignments.$.careTeamId": args.careTeamId,
          "assignments.$.consentStatus": "pending",
          "assignments.$.facilityId": args.facilityId,
          "assignments.$.orgId": args.orgId,
          "assignments.$.status": "pending",
          "assignments.$.updatedAt": nowIso,
          updatedAt: now,
        },
      },
    );
  } else {
    const assignment: PatientAssignmentDoc = {
      assignmentId,
      careTeamId: args.careTeamId,
      consentStatus: "pending",
      createdAt: nowIso,
      facilityId: args.facilityId,
      orgId: args.orgId,
      startsAt: null,
      status: "pending",
      updatedAt: nowIso,
    };

    await patients.updateOne(
      { _id: patientObjectId },
      {
        $push: { assignments: assignment },
        $set: { updatedAt: now },
      },
    );
  }

  const pendingFilter: Filter<PatientConsentDoc> = args.clinicianPrincipalId
    ? {
        assignmentId,
        clinicianPrincipalId: args.clinicianPrincipalId,
        patientId: patientObjectId,
        status: "pending",
        type: consentType,
      }
    : {
        assignmentId,
        clinicianPrincipalId: { $exists: false },
        patientId: patientObjectId,
        status: "pending",
        type: consentType,
      };

  const existingPending = await consents.findOne(pendingFilter, {
    projection: { _id: 1 },
  });

  if (existingPending) {
    return {
      assignmentId,
      consentId: String(existingPending._id),
      created: false,
    };
  }

  const consentId = new ObjectId();
  await consents.insertOne({
    _id: consentId,
    assignmentId,
    careTeamId: args.careTeamId,
    clinicianPrincipalId: args.clinicianPrincipalId,
    copy: buildCareTeamConsentCopy({
      careTeamId: args.careTeamId,
      clinicianPrincipalId: args.clinicianPrincipalId,
    }),
    createdAt: nowIso,
    createdBy: args.actorPrincipalId,
    decision: null,
    decisionSource: null,
    decidedAt: null,
    facilityId: args.facilityId,
    orgId: args.orgId,
    patientId: patientObjectId,
    principalId: patientPrincipalId,
    requestedAt: nowIso,
    status: "pending",
    type: consentType,
    updatedAt: nowIso,
    updatedBy: args.actorPrincipalId,
  });

  return {
    assignmentId,
    consentId: String(consentId),
    created: true,
  };
}
