import { NextRequest } from "next/server";
import { treeifyError } from "zod";
import type { Document as MongoDocument } from "mongodb";

import {
  COLLECTIONS,
  getCollection,
  SCOPES,
  UserPII_Create,
  TUserPII,
} from "@ckd/core/";

import { getDb } from "@/apps/api/lib/db/mongodb";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { ok, bad } from "@/apps/api/lib/http/responses";
import { requireUser, SessionUser } from "@/apps/api/lib/auth/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const requestId = makeRandomId();

  try {
    // 1) AuthZ (staff with USERS_PII_WRITE, or patient self-write if you support it)
    const user: SessionUser = await requireUser(req, SCOPES.USERS_PII_WRITE);

    // 2) Validate input
    const body = await req.json();
    const parsed = UserPII_Create.safeParse(body);
    if (!parsed.success) {
      return bad("Validation failed", treeifyError(parsed.error));
    }

    // 3) Optional guard: patients can only write their own PII (if you allow self-write)
    // If you don't allow patients to write PII at all, just forbid when role === "patient".
    // Example self-guard if payload includes patientId:
    // if (user.role === "patient" && parsed.data.patientId !== user.patientId) {
    //   return bad("Forbidden", { requestId }, 403);
    // }

    // 4) Audit actor
    const actor = {
      principalId: user.principalId, // stable person id (acc_* or pat_*)
      authId: user.authId, // credentialId used (JWT sub)
      kind: user.role === "patient" ? "patient" : "staff",
      role: user.role,
      orgId: user.orgId,
    } as const;

    const now = new Date();

    // 5) Assemble doc (mutable → set created+updated fields)
    // NOTE: if your TUserPII currently expects createdBy: string,
    // update it to accept the actor envelope shown here.
    const doc: Omit<TUserPII, "id"> = {
      ...parsed.data,
      ...(user.orgId ? { orgId: user.orgId } : {}),
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
      requestId, // handy to keep on the record for traceability
    } as any;

    // 6) Insert
    const database = await getDb();
    type UserPIIDoc = MongoDocument & TUserPII;
    const collection = getCollection<UserPIIDoc>(
      database,
      COLLECTIONS.UsersPII
    );

    const { insertedId } = await collection.insertOne(doc as UserPIIDoc);

    return ok({ _id: insertedId, requestId }, 201);
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", { requestId }, status);
  }
}
