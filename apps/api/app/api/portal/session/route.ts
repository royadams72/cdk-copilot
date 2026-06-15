import { NextRequest } from "next/server";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { bad, ok } from "@/apps/api/lib/http/responses";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);

    return ok({
      user: {
        allowedPatientIds: user.allowedPatientIds ?? [],
        careTeamIds: user.careTeamIds ?? [],
        facilityIds: user.facilityIds ?? [],
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
