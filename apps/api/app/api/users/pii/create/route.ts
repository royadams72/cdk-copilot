import { NextRequest } from "next/server";
import { treeifyError } from "zod";
import type { Document as MongoDocument } from "mongodb";

import { COLLECTIONS, getCollection, SCOPES } from "@ckd/core/server";

import { getDb } from "@/apps/api/lib/db/mongodb";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { ok, bad } from "@/apps/api/lib/http/responses";
import { requireUser, SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import { TUserPII } from "@ckd/core";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const requestId = makeRandomId();

  try {
    // 1) AuthZ (staff with USERS_PII_WRITE, or patient self-write if you support it)
    const user: SessionUser = await requireUser(req, SCOPES.USERS_PII_WRITE);

    const body = await req.json();
    // const parsed = UserPII_Create.safeParse(body);
    // if (!parsed.success) {
    //   return bad("Validation failed", treeifyError(parsed.error));
    // }

    // 3) Optional guard: patients can only write their own PII (if you allow self-write)
    // If you don't allow patients to write PII at all, just forbid when role === "patient".
    // Example self-guard if payload includes patientId:
    // if (user.role === "patient" && parsed.data.patientId !== user.patientId) {
    //   return bad("Forbidden", { requestId }, 403);
    // }
    console.log("user::", user, "body::", body);

    // 4) Audit actor
    const actor = {
      principalId: user.principalId, // stable person id (acc_* or pr_*)
      authId: user.authId, // credentialId used (JWT sub)
      role: user.role,
      orgId: user.orgId,
    } as const;

    const now = new Date();

    // 5) Assemble doc (mutable → set created+updated fields)
    // NOTE: if your TUserPII currently expects createdBy: string,
    // update it to accept the actor envelope shown here.
    const doc = {
      ...body,
      ...(user.orgId ? { orgId: user.orgId } : {}),
      updatedAt: now,
    } as any;

    // 6) Insert
    const database = await getDb();
    type UserPIIDoc = TUserPII;

    const userPII_db = getCollection(database, COLLECTIONS.UsersPII);

    await userPII_db.updateOne(
      { patientId: user.patientId },
      {
        $set: doc,
      }
    );

    return ok({ requestId }, 201);
  } catch (err: any) {
    const status = err?.code === 121 ? 400 : err?.status || 500;
    return bad(err?.message || "Server error", { requestId }, status);
  }
}
