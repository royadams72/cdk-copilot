export const runtime = "nodejs";

import { NextRequest } from "next/server";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  PortalPatientInviteDoc,
  syncExpiredPatientInvites,
} from "@/apps/api/lib/portal/patientInvites";
import { loadPortalStaffScope } from "@/apps/api/lib/portal/staffScope";
import { COLLECTIONS } from "@ckd/core/server";

type UserStaffDoc = {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  principalId: string;
  title?: string;
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

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (caller.role === "patient") {
      return bad("Portal staff session required", { code: "portal_staff_required" }, 403);
    }

    const db = await getDb();
    await syncExpiredPatientInvites(db);

    const scope = await loadPortalStaffScope(db, caller);
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

    return ok({
      items: invites.map((invite) => {
        const canMutate = invite.status !== "activated" && invite.status !== "revoked";
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
          facilityId: invite.facilityId,
          facilityLabel:
            facilityLabelById.get(invite.facilityId) ?? invite.facilityId,
          firstName: invite.firstName,
          id: invite._id.toHexString(),
          invitedAt: invite.invitedAt?.toISOString() ?? null,
          lastName: invite.lastName,
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
