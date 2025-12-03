import { NextRequest, NextResponse } from "next/server";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { SessionUser, requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { COLLECTIONS } from "@/packages/core/dist/server";
import { TUsersAccount } from "@/packages/core/dist/isomorphic";

export async function GET(req: NextRequest) {
  const requestId = makeRandomId();
  try {
    const user: SessionUser = await requireUser(req);
    if (!user.patientId) {
      return bad("Patient context missing", { requestId }, 403);
    }

    const database = await getDb();
    const usersAccounts = database.collection<TUsersAccount>(
      COLLECTIONS.UsersAccounts
    );
    const activeUser = await usersAccounts.findOne({
      principalId: user.principalId,
      isActive: true,
    });

    if (!activeUser) {
      return bad("Not found", { requestId }, 404);
    }

    await usersAccounts.updateOne(
      { principleId: activeUser.principalId },
      { $set: { lastActiveAt: new Date() } }
    );
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error: any) {
    const status = error?.status || 500;
    return bad(error?.message || "Server error", { requestId }, status);
  }
}
