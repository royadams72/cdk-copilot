import { NextRequest } from "next/server";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { bad, ok } from "@/apps/api/lib/http/responses";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);

    return ok({
      checkedAt: new Date().toISOString(),
      principalId: user.principalId,
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 401;
    const message =
      error instanceof Error ? error.message : "Unable to keep portal session alive";
    return bad(message, { code: "portal_keepalive_invalid" }, status);
  }
}
