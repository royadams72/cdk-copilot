import { NextRequest, NextResponse } from "next/server";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { SessionUser, requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { COLLECTIONS } from "@/packages/core/dist/server";

export async function GET(req: NextRequest) {
  const requestId = makeRandomId();
  try {
    const user: SessionUser = await requireUser(req);
    if (!user.patientId) {
      return bad("Patient context missing", { requestId }, 403);
    }
    console.log(user);

    const database = await getDb();
    const activeUser = await database
      .collection(COLLECTIONS.UsersAccounts)
      .findOne({ principalId: user.principalId, isActive: true });

    if (activeUser && activeUser.matchedCount === 0) {
      return bad("Not found", { requestId }, 404);
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error: any) {
    const status = error?.status || 500;
    return bad(error?.message || "Server error", { requestId }, status);
  }
}
