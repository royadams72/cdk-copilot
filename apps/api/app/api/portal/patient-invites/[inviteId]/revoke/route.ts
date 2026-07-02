export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { PortalPatientInviteDoc } from "@/apps/api/lib/portal/patientInvites";
import { assertPortalCareTeamFacilityAccess } from "@/apps/api/lib/portal/staffScope";
import { COLLECTIONS } from "@ckd/core/server";

const REVOCABLE_STATUSES = new Set(["pending_review", "invited", "expired"]);

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

    if (!REVOCABLE_STATUSES.has(invite.status)) {
      return bad(
        "Only pending, invited, or expired invites can be revoked",
        { code: "invite_revoke_not_allowed" },
        409,
      );
    }

    const now = new Date();
    await invites.updateOne(
      { _id: invite._id },
      {
        $set: {
          status: "revoked",
          updatedAt: now,
          updatedBy: caller.principalId,
        },
      },
    );

    return ok({
      inviteId,
      status: "revoked",
    });
  } catch (error: any) {
    return bad(
      error?.message || "Unable to revoke invite",
      undefined,
      error?.status || 500,
    );
  }
}
