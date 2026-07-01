export const runtime = "nodejs";

import { NextRequest } from "next/server";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  PortalInviteBatchBody,
  validatePortalInviteBatch,
} from "@/apps/api/lib/portal/patientInvites";

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (caller.role === "patient") {
      return bad("Portal staff session required", { code: "portal_staff_required" }, 403);
    }

    const parsed = PortalInviteBatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return bad(
        parsed.error.issues[0]?.message ?? "Invalid intake batch",
        { code: "invalid_invite_batch" },
        400,
      );
    }

    const db = await getDb();
    const result = await validatePortalInviteBatch({
      body: parsed.data,
      caller,
      db,
    });

    return ok(result);
  } catch (error: any) {
    return bad(
      error?.message || "Unable to validate patient invite batch",
      undefined,
      error?.status || 500,
    );
  }
}
