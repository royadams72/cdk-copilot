import { Db, ObjectId } from "mongodb";

import type { SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import {
  derivePatientLifecycleStatus,
  formatPatientLifecycleStatusLabel,
  getPrimaryAssignment,
  type PortalPatientLifecycleStatus,
} from "@/apps/api/lib/portal/patientLifecycle";
import { buildPortalPatientAccessMatch, buildPortalPatientDetailPipeline, type RawPortalPatientDetailDoc } from "@/apps/api/lib/portal/patients";
import type { PortalPatientAssignment } from "@/apps/api/lib/portal/patients";
import type { PortalPatientDetail } from "@/apps/api/lib/portal/patient-shared";
import { mapPortalPatientDetail } from "@/apps/api/lib/portal/patients";
import type { TPatientInvite } from "@ckd/core";
import { COLLECTIONS } from "core/server/constants/collections";
import type { TPatientMembershipEventDoc } from "core/server/schemas/patientMembership";
import type { TPatientMembershipAction } from "core/isomorphic/schemas/patient_membership_events";

type PatientDoc = {
  _id: ObjectId;
  assignments?: PortalPatientAssignment[];
  summary?: Record<string, unknown> | null;
  updatedAt?: Date;
};

type UserStaffDoc = {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  principalId: string;
  title?: string;
};

type PatientInviteDoc = Pick<
  TPatientInvite,
  | "activatedAt"
  | "createdAt"
  | "createdBy"
  | "email"
  | "invitedAt"
  | "principalId"
  | "reviewNote"
  | "reviewedBy"
  | "status"
  | "updatedAt"
  | "updatedBy"
>;

export type PortalPatientMembershipEventRow = {
  action: TPatientMembershipAction;
  actorName: string | null;
  actorPrincipalId: string;
  actorRole: string;
  createdAt: string;
  nextEndsAt: string | null;
  nextStatus: string;
  note: string;
  previousEndsAt: string | null;
  previousStatus: string;
};

export type PortalPatientMembershipTimelineRow = {
  action:
    | TPatientMembershipAction
    | "invite_created"
    | "invite_sent"
    | "invite_activated"
    | "invite_expired"
    | "invite_revoked"
    | "invite_cancelled";
  actorName: string | null;
  actorPrincipalId: string | null;
  actorRole: string;
  createdAt: string;
  note: string | null;
  statusDetail: string;
  summary: string;
};

export type PortalPatientMembershipSnapshot = {
  assignmentId: string | null;
  careTeamId: string | null;
  computedStatus: PortalPatientLifecycleStatus;
  consentStatus: string | null;
  daysRemaining: number | null;
  endsAt: string | null;
  facilityId: string | null;
  orgId: string | null;
  startsAt: string | null;
  status: string | null;
};

function toIso(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export const computeMembershipStatus = derivePatientLifecycleStatus;

function formatActorName(parts: Array<string | null | undefined>) {
  const value = parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .trim();
  return value || null;
}

function formatStaffDisplayName(doc: UserStaffDoc | null | undefined) {
  if (!doc) {
    return null;
  }

  return (
    doc.displayName?.trim() ||
    formatActorName([doc.title, doc.firstName, doc.lastName]) ||
    formatActorName([doc.firstName, doc.lastName]) ||
    null
  );
}

export function mapMembershipSnapshot(
  assignment: PortalPatientAssignment | null | undefined,
): PortalPatientMembershipSnapshot {
  const computedStatus = computeMembershipStatus({ assignment });
  const endsAt = toIso(assignment?.endsAt);
  const daysRemaining =
    endsAt && computedStatus !== "expired"
      ? Math.max(
          0,
          Math.ceil((new Date(endsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
        )
      : computedStatus === "expired"
        ? 0
        : null;

  return {
    assignmentId: assignment?.assignmentId ?? null,
    careTeamId: assignment?.careTeamId ?? null,
    computedStatus,
    consentStatus: assignment?.consentStatus ?? null,
    daysRemaining,
    endsAt,
    facilityId: assignment?.facilityId ?? null,
    orgId: assignment?.orgId ?? null,
    startsAt: toIso(assignment?.startsAt),
    status: assignment?.status ?? null,
  };
}

export async function loadPortalPatientMembershipContext(args: {
  db: Db;
  patientId: string;
  user: SessionUser;
}) {
  const patientObjectId = new ObjectId(args.patientId);
  const raw = await args.db
    .collection(COLLECTIONS.Patients)
    .aggregate<RawPortalPatientDetailDoc>(
      buildPortalPatientDetailPipeline({
        ...buildPortalPatientAccessMatch(args.user),
        _id: patientObjectId,
      }),
    )
    .next();

  if (!raw) {
    throw Object.assign(new Error("Patient not found"), { status: 404 });
  }

  const patient = mapPortalPatientDetail(raw);
  const patientDoc = await args.db.collection<PatientDoc>(COLLECTIONS.Patients).findOne(
    { _id: patientObjectId },
    { projection: { _id: 1, assignments: 1, summary: 1, updatedAt: 1 } },
  );

  if (!patientDoc) {
    throw Object.assign(new Error("Patient not found"), { status: 404 });
  }

  const primaryAssignment = getPrimaryAssignment(patientDoc.assignments ?? []);
  return {
    patient,
    patientDoc,
    primaryAssignment: primaryAssignment as PortalPatientAssignment | null,
  };
}

export async function loadMembershipEvents(args: {
  db: Db;
  patientId: ObjectId;
}) {
  const rows = await args.db
    .collection<TPatientMembershipEventDoc>(COLLECTIONS.PatientMembershipEvents)
    .find(
      { patientId: args.patientId },
      {
        projection: {
          _id: 0,
          action: 1,
          actorPrincipalId: 1,
          actorRole: 1,
          createdAt: 1,
          nextEndsAt: 1,
          nextStatus: 1,
          note: 1,
          previousEndsAt: 1,
          previousStatus: 1,
        },
      },
    )
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  const principalIds = [
    ...new Set(rows.map((row) => row.actorPrincipalId).filter(Boolean)),
  ];
  const staffDocs = principalIds.length
    ? await args.db
        .collection<UserStaffDoc>(COLLECTIONS.UsersStaff)
        .find(
          { principalId: { $in: principalIds } },
          {
            projection: {
              _id: 0,
              displayName: 1,
              firstName: 1,
              lastName: 1,
              principalId: 1,
              title: 1,
            },
          },
        )
        .toArray()
    : [];
  const staffByPrincipalId = new Map(
    staffDocs.map((doc) => [doc.principalId, doc] as const),
  );

  return rows.map((row) => ({
    action: row.action,
    actorName: formatStaffDisplayName(
      staffByPrincipalId.get(row.actorPrincipalId),
    ),
    actorPrincipalId: row.actorPrincipalId,
    actorRole: row.actorRole,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
    nextEndsAt:
      row.nextEndsAt instanceof Date
        ? row.nextEndsAt.toISOString()
        : row.nextEndsAt
          ? new Date(row.nextEndsAt).toISOString()
          : null,
    nextStatus: row.nextStatus,
    note: row.note,
    previousEndsAt:
      row.previousEndsAt instanceof Date
        ? row.previousEndsAt.toISOString()
        : row.previousEndsAt
          ? new Date(row.previousEndsAt).toISOString()
          : null,
    previousStatus: row.previousStatus,
  })) satisfies PortalPatientMembershipEventRow[];
}

function formatMembershipActionLabel(action: TPatientMembershipAction) {
  switch (action) {
    case "extended":
      return "Membership extended";
    case "suspended":
      return "Membership suspended";
    case "ended":
      return "Membership ended";
    case "reactivated":
      return "Membership reactivated";
  }
}

function formatInviteStatusLabel(status: PatientInviteDoc["status"]) {
  switch (status) {
    case "pending_review":
      return "Pending send";
    case "invited":
      return "Invited";
    case "activated":
      return "Activated";
    case "expired":
      return "Expired";
    case "revoked":
      return "Revoked";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export async function loadMembershipTimeline(args: {
  db: Db;
  patientId: ObjectId;
}) {
  const membershipEvents = await loadMembershipEvents(args);
  const inviteDocs = await args.db
    .collection<PatientInviteDoc>(COLLECTIONS.PatientInvites)
    .find(
      { patientId: args.patientId },
      {
        projection: {
          _id: 0,
          activatedAt: 1,
          createdAt: 1,
          createdBy: 1,
          email: 1,
          invitedAt: 1,
          principalId: 1,
          reviewNote: 1,
          reviewedBy: 1,
          status: 1,
          updatedAt: 1,
          updatedBy: 1,
        },
      },
    )
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();

  const principalIds = [
    ...new Set(
      inviteDocs
        .flatMap((invite) => [invite.createdBy, invite.updatedBy, invite.reviewedBy])
        .filter(Boolean),
    ),
  ];
  const staffDocs = principalIds.length
    ? await args.db
        .collection<UserStaffDoc>(COLLECTIONS.UsersStaff)
        .find(
          { principalId: { $in: principalIds as string[] } },
          {
            projection: {
              _id: 0,
              displayName: 1,
              firstName: 1,
              lastName: 1,
              principalId: 1,
              title: 1,
            },
          },
        )
        .toArray()
    : [];
  const staffByPrincipalId = new Map(
    staffDocs.map((doc) => [doc.principalId, doc] as const),
  );

  const inviteRows: PortalPatientMembershipTimelineRow[] = inviteDocs.flatMap((invite) => {
    const rows: PortalPatientMembershipTimelineRow[] = [];
    const createdAt = new Date(invite.createdAt);
    if (!Number.isNaN(createdAt.getTime())) {
      rows.push({
        action: "invite_created",
        actorName: formatStaffDisplayName(
          staffByPrincipalId.get(invite.createdBy),
        ),
        actorPrincipalId: invite.createdBy,
        actorRole: "staff",
        createdAt: createdAt.toISOString(),
        note: invite.reviewNote ?? null,
        statusDetail: "Pending send",
        summary: `Invite prepared for ${invite.email}.`,
      });
    }

    if (invite.invitedAt) {
      const invitedAt = new Date(invite.invitedAt);
      if (!Number.isNaN(invitedAt.getTime())) {
        rows.push({
          action: "invite_sent",
          actorName: formatStaffDisplayName(
            staffByPrincipalId.get(invite.updatedBy),
          ),
          actorPrincipalId: invite.updatedBy,
          actorRole: "staff",
          createdAt: invitedAt.toISOString(),
          note: null,
          statusDetail: "Invited",
          summary: `Invite sent to ${invite.email}.`,
        });
      }
    }

    if (invite.activatedAt) {
      const activatedAt = new Date(invite.activatedAt);
      if (!Number.isNaN(activatedAt.getTime())) {
        rows.push({
          action: "invite_activated",
          actorName: null,
          actorPrincipalId: invite.principalId,
          actorRole: "patient",
          createdAt: activatedAt.toISOString(),
          note: null,
          statusDetail: "Activated",
          summary: "Patient activated their invitation.",
        });
      }
    }

    if (
      invite.status === "expired" ||
      invite.status === "revoked" ||
      invite.status === "cancelled"
    ) {
      const updatedAt = new Date(invite.updatedAt);
      if (!Number.isNaN(updatedAt.getTime())) {
        rows.push({
          action:
            invite.status === "expired"
              ? "invite_expired"
              : invite.status === "revoked"
                ? "invite_revoked"
                : "invite_cancelled",
          actorName: formatStaffDisplayName(
            staffByPrincipalId.get(invite.updatedBy),
          ),
          actorPrincipalId: invite.updatedBy,
          actorRole: "staff",
          createdAt: updatedAt.toISOString(),
          note: invite.reviewNote ?? null,
          statusDetail: formatInviteStatusLabel(invite.status),
          summary: `Invite marked ${formatInviteStatusLabel(invite.status).toLowerCase()}.`,
        });
      }
    }

    return rows;
  });

  const membershipRows: PortalPatientMembershipTimelineRow[] =
    membershipEvents.map((event) => ({
      action: event.action,
      actorName: event.actorName,
      actorPrincipalId: event.actorPrincipalId,
      actorRole: event.actorRole,
      createdAt: event.createdAt,
      note: event.note,
      statusDetail: `${formatPatientLifecycleStatusLabel(
        event.previousStatus as Parameters<typeof formatPatientLifecycleStatusLabel>[0],
      )} to ${formatPatientLifecycleStatusLabel(
        event.nextStatus as Parameters<typeof formatPatientLifecycleStatusLabel>[0],
      )}`,
      summary: formatMembershipActionLabel(event.action),
    }));

  return [...inviteRows, ...membershipRows]
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )
    .slice(0, 30);
}

export type PortalPatientMembershipResponse = {
  events: PortalPatientMembershipTimelineRow[];
  membership: PortalPatientMembershipSnapshot;
  patient: PortalPatientDetail;
};
