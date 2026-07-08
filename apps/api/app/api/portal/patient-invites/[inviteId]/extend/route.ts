export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { PortalPatientInviteDoc } from "@/apps/api/lib/portal/patientInvites";
import { assertPortalCareTeamFacilityAccess } from "@/apps/api/lib/portal/staffScope";
import { COLLECTIONS } from "@ckd/core/server";

const EXTENDABLE_STATUSES = new Set(["pending_review", "invited", "expired"]);

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ inviteId: string }> },
) {
  try {
    const caller = await requireUser(req);
    if (caller.role === "patient") {
      return bad("Portal staff session required", { code: "portal_staff_required" }, 403);
    }

    const { inviteId } = await context.params;
    if (!ObjectId.isValid(inviteId)) {
      return bad("Invite not found", { code: "invite_not_found" }, 404);
    }

    const db = await getDb();
    const invites = db.collection<PortalPatientInviteDoc>(COLLECTIONS.PatientInvites);
    const invite = await invites.findOne({ _id: new ObjectId(inviteId) });

    if (!invite) {
      return bad("Invite not found", { code: "invite_not_found" }, 404);
    }

    await assertPortalCareTeamFacilityAccess({
      careTeamId: invite.careTeamId,
      caller,
      db,
      facilityId: invite.facilityId,
    });

    if (invite.activatedAt) {
      return bad(
        "Activated invites cannot be extended",
        { code: "invite_extend_not_allowed" },
        409,
      );
    }

    if (!EXTENDABLE_STATUSES.has(invite.status)) {
      return bad(
        "Only pending, invited, or expired invites can be extended",
        { code: "invite_extend_not_allowed" },
        409,
      );
    }

    const now = new Date();
    const base =
      invite.activationExpiresAt instanceof Date &&
      invite.activationExpiresAt.getTime() > now.getTime()
        ? new Date(invite.activationExpiresAt)
        : now;
    const activationExpiresAt = new Date(base);
    activationExpiresAt.setDate(activationExpiresAt.getDate() + 7);
    const nextStatus = invite.status === "pending_review" ? "pending_review" : "invited";

    await invites.updateOne(
      { _id: invite._id },
      {
        $set: {
          activationExpiresAt,
          status: nextStatus,
          updatedAt: now,
          updatedBy: caller.principalId,
        },
      },
    );

    return ok({
      activationExpiresAt: activationExpiresAt.toISOString(),
      inviteId,
      status: nextStatus,
    });
  } catch (error: any) {
    return bad(
      error?.message || "Unable to extend invite",
      undefined,
      error?.status || 500,
    );
  }
}
