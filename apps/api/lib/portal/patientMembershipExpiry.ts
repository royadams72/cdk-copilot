import { ObjectId, type Db } from "mongodb";

import { getPrimaryAssignment } from "@/apps/api/lib/portal/patientLifecycle";
import { buildExpiredAssignmentEndsAtFilter } from "@/apps/api/lib/utils/patientAssignmentDateFilters";
import { COLLECTIONS } from "core/server/constants/collections";
import type { TPatientMembershipEventDoc } from "core/server/schemas/patientMembership";

type PatientAssignmentDoc = {
  assignmentId: string;
  careTeamId: string;
  consentStatus?: string | null;
  createdAt: string;
  endsAt?: Date | string | null;
  facilityId: string;
  orgId: string;
  startsAt?: Date | string | null;
  status: "pending" | "active" | "inactive" | "ended";
  updatedAt: string;
};

type PatientDoc = {
  _id: ObjectId;
  assignments?: PatientAssignmentDoc[];
  summary?: {
    membershipEndsAt?: string | null;
    membershipStartedAt?: string | null;
  } & Record<string, unknown>;
};

type SyncExpiredMembershipsArgs = {
  assignmentScope?: {
    careTeamIds?: string[];
    facilityIds?: string[];
    orgId?: string | null;
  };
  db: Db;
  now?: Date;
  patientId?: ObjectId;
};

type SyncExpiredMembershipsResult = {
  affectedPatientCount: number;
  expiredAssignmentCount: number;
};

const SYSTEM_ACTOR_PRINCIPAL_ID = "system_membership_expiry";
const SYSTEM_ACTOR_ROLE = "system";
const AUTO_END_NOTE =
  "Membership automatically ended because the access end date passed.";

function buildAssignmentScopeMatch(
  scope:
    | {
        careTeamIds?: string[];
        facilityIds?: string[];
        orgId?: string | null;
      }
    | undefined,
) {
  const match: Record<string, unknown> = {};

  if (scope?.orgId) {
    match.orgId = scope.orgId;
  }

  const facilityIds = scope?.facilityIds?.filter(Boolean) ?? [];
  if (facilityIds.length) {
    match.facilityId = { $in: facilityIds };
  }

  const careTeamIds = scope?.careTeamIds?.filter(Boolean) ?? [];
  if (careTeamIds.length) {
    match.careTeamId = { $in: careTeamIds };
  }

  return match;
}

function isAssignmentWithinScope(
  assignment: PatientAssignmentDoc | null | undefined,
  scope:
    | {
        careTeamIds?: string[];
        facilityIds?: string[];
        orgId?: string | null;
      }
    | undefined,
) {
  if (!assignment) {
    return false;
  }

  if (scope?.orgId && assignment.orgId !== scope.orgId) {
    return false;
  }

  const facilityIds = scope?.facilityIds?.filter(Boolean) ?? [];
  if (facilityIds.length && !facilityIds.includes(assignment.facilityId)) {
    return false;
  }

  const careTeamIds = scope?.careTeamIds?.filter(Boolean) ?? [];
  if (careTeamIds.length && !careTeamIds.includes(assignment.careTeamId)) {
    return false;
  }

  return true;
}

function isExpiredActiveAssignment(
  assignment: PatientAssignmentDoc | null | undefined,
  now: Date,
) {
  if (!assignment || assignment.status !== "active" || !assignment.endsAt) {
    return false;
  }

  const endsAt = new Date(assignment.endsAt);
  if (Number.isNaN(endsAt.getTime())) {
    return false;
  }

  return endsAt.getTime() <= now.getTime();
}

function toIsoOrNull(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function syncExpiredPatientMemberships(
  args: SyncExpiredMembershipsArgs,
): Promise<SyncExpiredMembershipsResult> {
  const now = args.now ?? new Date();
  const nowIso = now.toISOString();
  const patientFilter = args.patientId ? { _id: args.patientId } : {};
  const assignmentScopeMatch = buildAssignmentScopeMatch(args.assignmentScope);

  const patients = await args.db
    .collection<PatientDoc>(COLLECTIONS.Patients)
    .find(
      {
        ...patientFilter,
        assignments: {
          $elemMatch: {
            ...assignmentScopeMatch,
            status: "active",
            ...buildExpiredAssignmentEndsAtFilter(now),
          },
        },
      },
      {
        projection: {
          _id: 1,
          assignments: 1,
          summary: 1,
        },
      },
    )
    .toArray();

  if (!patients.length) {
    return { affectedPatientCount: 0, expiredAssignmentCount: 0 };
  }

  let expiredAssignmentCount = 0;

  for (const patient of patients) {
    const nextAssignments = (patient.assignments ?? []).map((assignment) => {
      if (
        !isAssignmentWithinScope(assignment, args.assignmentScope) ||
        !isExpiredActiveAssignment(assignment, now)
      ) {
        return assignment;
      }

      expiredAssignmentCount += 1;
      return {
        ...assignment,
        status: "ended" as const,
        updatedAt: nowIso,
      };
    });

    const primaryAssignment = getPrimaryAssignment(nextAssignments, now);
    const nextSummary = {
      ...(patient.summary ?? {}),
      membershipEndsAt: toIsoOrNull(primaryAssignment?.endsAt),
      membershipStartedAt: toIsoOrNull(primaryAssignment?.startsAt),
    };

    await args.db.collection(COLLECTIONS.Patients).updateOne(
      { _id: patient._id },
      {
        $set: {
          assignments: nextAssignments,
          summary: nextSummary,
          updatedAt: now,
        },
      },
    );

    const events = nextAssignments
      .filter((assignment, index) =>
        isAssignmentWithinScope(patient.assignments?.[index], args.assignmentScope) &&
        isExpiredActiveAssignment(patient.assignments?.[index], now),
      )
      .map<TPatientMembershipEventDoc>((assignment, index) => {
        const previousAssignment = patient.assignments?.[index];
        return {
          action: "ended",
          actorPrincipalId: SYSTEM_ACTOR_PRINCIPAL_ID,
          actorRole: SYSTEM_ACTOR_ROLE,
          assignmentId: assignment.assignmentId,
          careTeamId: assignment.careTeamId,
          createdAt: now,
          facilityId: assignment.facilityId,
          nextEndsAt:
            assignment.endsAt instanceof Date
              ? assignment.endsAt
              : assignment.endsAt
                ? new Date(assignment.endsAt)
                : now,
          nextStatus: "ended",
          note: AUTO_END_NOTE,
          orgId: assignment.orgId,
          patientId: patient._id,
          previousEndsAt:
            previousAssignment?.endsAt instanceof Date
              ? previousAssignment.endsAt
              : previousAssignment?.endsAt
                ? new Date(previousAssignment.endsAt)
                : null,
          previousStatus: "active",
        };
      });

    if (events.length) {
      await args.db
        .collection<TPatientMembershipEventDoc>(COLLECTIONS.PatientMembershipEvents)
        .insertMany(events);
    }
  }

  return {
    affectedPatientCount: patients.length,
    expiredAssignmentCount,
  };
}
