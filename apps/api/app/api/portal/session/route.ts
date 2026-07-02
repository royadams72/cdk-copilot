import { NextRequest } from "next/server";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
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

function formatStaffDisplayName(doc: UserStaffDoc) {
  return (
    doc.displayName?.trim() ||
    formatActorName([doc.title, doc.firstName, doc.lastName]) ||
    formatActorName([doc.firstName, doc.lastName]) ||
    null
  );
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const db = await getDb();
    const staffDoc = await db.collection<UserStaffDoc>(COLLECTIONS.UsersStaff).findOne(
      { principalId: user.principalId },
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
    );
    const displayName = staffDoc ? formatStaffDisplayName(staffDoc) : null;
    const scope = await loadPortalStaffScope(db, user);

    return ok({
      user: {
        allowedPatientIds: user.allowedPatientIds ?? [],
        careTeamIds: scope.careTeamIds,
        careTeams: scope.careTeams,
        displayName,
        facilities: scope.facilities,
        facilityIds: scope.facilityIds,
        orgId: user.orgId ?? null,
        principalId: user.principalId,
        role: user.role,
        scopes: user.scopes,
      },
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 401;
    const message =
      error instanceof Error ? error.message : "Unable to validate portal session";
    return bad(message, { code: "portal_session_invalid" }, status);
  }
}
