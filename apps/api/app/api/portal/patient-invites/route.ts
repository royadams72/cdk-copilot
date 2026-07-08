export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  derivePatientLifecycleStatus,
  formatPatientLifecycleStatusLabel,
} from "@/apps/api/lib/portal/patientLifecycle";
import {
  PortalPatientInviteDoc,
  type PortalPatientInviteMembershipLifecycleStatus,
  syncExpiredPatientInvites,
} from "@/apps/api/lib/portal/patientInvites";
import { syncExpiredPatientMemberships } from "@/apps/api/lib/portal/patientMembershipExpiry";
import { loadPortalStaffScope } from "@/apps/api/lib/portal/staffScope";
import { COLLECTIONS } from "@ckd/core/server";

type UserStaffDoc = {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  principalId: string;
  title?: string;
};

type PatientMembershipDoc = {
  _id: ObjectId;
  assignments?: Array<{
    endsAt?: Date | string | null;
    status?: string | null;
  }>;
};

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

function getInviteDisplayStatus(args: {
  inviteStatus: PortalPatientInviteDoc["status"];
  membershipLifecycleStatus: PortalPatientInviteMembershipLifecycleStatus | null;
}) {
  if (args.inviteStatus !== "activated") {
    return args.inviteStatus;
  }

  switch (args.membershipLifecycleStatus) {
    case "endingSoon":
      return "ending_soon";
    case "inactive":
      return "inactive";
    case "expired":
    case "ended":
      return "ended";
    case "pending":
      return "pending_review";
    case "active":
    default:
      return "activated";
  }
}

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (caller.role === "patient") {
      return bad("Portal staff session required", { code: "portal_staff_required" }, 403);
    }

    const db = await getDb();
    const scope = await loadPortalStaffScope(db, caller);
    await syncExpiredPatientInvites({
      db,
      inviteScope: {
        careTeamIds: scope.careTeamIds,
        facilityIds: scope.facilityIds,
        orgId: caller.orgId,
      },
    });
    await syncExpiredPatientMemberships({
      assignmentScope: {
        careTeamIds: scope.careTeamIds,
        facilityIds: scope.facilityIds,
        orgId: caller.orgId,
      },
      db,
    });

    const careTeamIds = scope.careTeamIds;
    if (!careTeamIds.length) {
      return ok({ items: [] });
    }

    const invites = await db
      .collection<PortalPatientInviteDoc>(COLLECTIONS.PatientInvites)
      .find(
        {
          careTeamId: { $in: careTeamIds },
          orgId: caller.orgId ?? "org_demo",
        },
        {
          projection: {
            _id: 1,
            activatedAt: 1,
            activationCodeMasked: 1,
            activationExpiresAt: 1,
            careTeamId: 1,
            createdAt: 1,
            createdBy: 1,
            dateOfBirth: 1,
            durationMonths: 1,
            email: 1,
            facilityId: 1,
            firstName: 1,
            invitedAt: 1,
            lastName: 1,
            nhsNumber: 1,
            patientId: 1,
            principalId: 1,
            status: 1,
            updatedAt: 1,
            updatedBy: 1,
          },
          sort: { updatedAt: -1, createdAt: -1 },
        },
      )
      .limit(200)
      .toArray();

    const principalIds = [
      ...new Set(
        invites.flatMap((invite) => [invite.createdBy, invite.updatedBy]).filter(Boolean),
      ),
    ];
    const staffDocs = principalIds.length
      ? await db
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
    const careTeamLabelById = new Map(scope.careTeams.map((item) => [item.id, item.label]));
    const facilityLabelById = new Map(scope.facilities.map((item) => [item.id, item.label]));
    const patientIds = invites.map((invite) => invite.patientId);
    const patientDocs = patientIds.length
      ? await db
          .collection<PatientMembershipDoc>(COLLECTIONS.Patients)
          .find(
            { _id: { $in: patientIds } },
            { projection: { _id: 1, assignments: 1 } },
          )
          .toArray()
      : [];
    const patientById = new Map(
      patientDocs.map((doc) => [doc._id.toHexString(), doc] as const),
    );

    return ok({
      items: invites.map((invite) => {
        const canMutate = invite.status !== "activated" && invite.status !== "revoked";
        const patientDoc = patientById.get(invite.patientId.toHexString());
        const membershipLifecycleStatus =
          invite.status === "activated"
            ? derivePatientLifecycleStatus({
                assignments: patientDoc?.assignments,
              })
            : null;
        const displayStatus = getInviteDisplayStatus({
          inviteStatus: invite.status,
          membershipLifecycleStatus,
        });
        return {
          activatedAt: invite.activatedAt?.toISOString() ?? null,
          activationCodeMasked: invite.activationCodeMasked,
          activationExpiresAt: invite.activationExpiresAt.toISOString(),
          canExtend: canMutate && invite.status !== "cancelled",
          canResend: canMutate && invite.status !== "cancelled",
          canRevoke: canMutate && invite.status !== "cancelled",
          careTeamId: invite.careTeamId,
          careTeamLabel: careTeamLabelById.get(invite.careTeamId) ?? invite.careTeamId,
          createdAt: invite.createdAt.toISOString(),
          createdByName: formatStaffDisplayName(
            staffByPrincipalId.get(invite.createdBy),
          ),
          createdByPrincipalId: invite.createdBy,
          dateOfBirth: invite.dateOfBirth.toISOString(),
          durationMonths: invite.durationMonths,
          email: invite.email,
          displayStatus,
          displayStatusLabel:
            invite.status === "activated" && membershipLifecycleStatus
              ? `Activated · ${formatPatientLifecycleStatusLabel(membershipLifecycleStatus)}`
              : displayStatus === "ending_soon"
                ? "Ending soon"
                : displayStatus === "inactive"
                  ? "Suspended"
                  : displayStatus === "ended"
                    ? "Ended"
                    : invite.status === "pending_review"
                      ? "Pending send"
                      : invite.status === "invited"
                        ? "Invited"
                        : invite.status === "expired"
                          ? "Expired"
                          : invite.status === "revoked"
                            ? "Revoked"
                            : invite.status === "cancelled"
                              ? "Cancelled"
                              : "Activated",
          facilityId: invite.facilityId,
          facilityLabel:
            facilityLabelById.get(invite.facilityId) ?? invite.facilityId,
          firstName: invite.firstName,
          id: invite._id.toHexString(),
          invitedAt: invite.invitedAt?.toISOString() ?? null,
          lastName: invite.lastName,
          membershipAccessEndsAt:
            membershipLifecycleStatus && patientDoc?.assignments?.length
              ? (() => {
                  const activeLike =
                    patientDoc.assignments.find(
                      (assignment) =>
                        assignment.status === "active" && assignment.endsAt,
                    ) ??
                    patientDoc.assignments[0] ??
                    null;
                  if (!activeLike?.endsAt) {
                    return null;
                  }
                  const value =
                    activeLike.endsAt instanceof Date
                      ? activeLike.endsAt
                      : new Date(activeLike.endsAt);
                  return Number.isNaN(value.getTime()) ? null : value.toISOString();
                })()
              : null,
          membershipLifecycleStatus,
          membershipStatus:
            membershipLifecycleStatus &&
            formatPatientLifecycleStatusLabel(membershipLifecycleStatus),
          nhsNumber: invite.nhsNumber ?? null,
          patientId: invite.patientId.toHexString(),
          principalId: invite.principalId,
          status: invite.status,
          updatedAt: invite.updatedAt.toISOString(),
          updatedByName: formatStaffDisplayName(
            staffByPrincipalId.get(invite.updatedBy),
          ),
          updatedByPrincipalId: invite.updatedBy,
        };
      }),
    });
  } catch (error: any) {
    return bad(
      error?.message || "Unable to load patient invites",
      undefined,
      error?.status || 500,
    );
  }
}
