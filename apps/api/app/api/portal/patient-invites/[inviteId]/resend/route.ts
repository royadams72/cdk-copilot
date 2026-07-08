export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  hashActivationCode,
  makeActivationCode,
  sendPatientInviteEmail,
} from "@/apps/api/lib/portal/patientInviteDelivery";
import { PortalPatientInviteDoc } from "@/apps/api/lib/portal/patientInvites";
import { assertPortalCareTeamFacilityAccess } from "@/apps/api/lib/portal/staffScope";
import { COLLECTIONS } from "@ckd/core/server";

const RESENDABLE_STATUSES = new Set(["pending_review", "invited", "expired"]);

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
        "Activated invites cannot be resent",
        { code: "invite_resend_not_allowed" },
        409,
      );
    }

    if (!RESENDABLE_STATUSES.has(invite.status)) {
      return bad(
        "Only pending, invited, or expired invites can be resent",
        { code: "invite_resend_not_allowed" },
        409,
      );
    }

    const activationCode = makeActivationCode();
    const activationExpiresAt = new Date();
    activationExpiresAt.setDate(activationExpiresAt.getDate() + 7);
    const delivery = await sendPatientInviteEmail({
      activationCode,
      email: invite.email,
      expiresAt: activationExpiresAt,
    });

    if (!delivery.ok) {
      return bad(
        delivery.errorMessage || "Unable to send invite email",
        { code: "invite_email_failed" },
        502,
      );
    }

    const now = new Date();
    await invites.updateOne(
      { _id: invite._id },
      {
        $set: {
          activationCodeHash: hashActivationCode(activationCode),
          activationCodeMasked: activationCode.slice(-4),
          activationExpiresAt,
          invitedAt: now,
          status: "invited",
          updatedAt: now,
          updatedBy: caller.principalId,
        },
      },
    );

    return ok({
      activationCode: delivery.activationCode,
      activationExpiresAt: activationExpiresAt.toISOString(),
      inviteId,
      status: "invited",
    });
  } catch (error: any) {
    return bad(
      error?.message || "Unable to resend invite",
      undefined,
      error?.status || 500,
    );
  }
}
