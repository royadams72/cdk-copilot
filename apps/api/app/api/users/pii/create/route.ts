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
    const user: SessionUser = await requireUser(req, SCOPES.USERS_PII_WRITE);

    const body = await req.json();
    const parsed = UserPII_Create.safeParse(body);
    if (!parsed.success)
      return bad("Validation failed", treeifyError(parsed.error));

    const now = new Date();
    const doc: Omit<TUserPII, "id"> = {
      ...parsed.data,
      ...(user.orgId ? { orgId: user.orgId } : {}),
      createdAt: now,
      updatedAt: now,
      createdBy: user.authId,
    };

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
