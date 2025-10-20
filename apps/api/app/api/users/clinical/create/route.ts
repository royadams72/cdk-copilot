// app/api/users/pii/route.ts
import { NextRequest } from "next/server";
import { treeifyError } from "zod";
import {
  COLLECTIONS,
  getCollection,
  SCOPES,
  TUserPII,
  TUserPIICreate,
  UserPII_Base,
  UserPII_Create,
} from "@ckd/core/";

import { getDb } from "@/apps/api/lib/db/mongodb";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { ok, bad } from "@/apps/api/lib/http/responses";
import { requireUser, SessionUser } from "@/apps/api/lib/auth/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const requestId = makeRandomId();

  try {
    const user: SessionUser = await requireUser(req, [
      SCOPES.USERS_CLINICAL_WRITE,
    ]);

    const body = await req.json();
    const parsed = UserPII_Create.safeParse(body);
    if (!parsed.success) {
      return bad("Validation failed", treeifyError(parsed.error), 400);
    }

    const now = new Date();
    const insertDoc: Omit<TUserPII, "id"> = {
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
    };

    const db = await getDb();
    const collection = getCollection<TUserPII>(db, COLLECTIONS.UsersPII);

    const { insertedId } = await collection.insertOne(insertDoc as any);

    return ok({ _id: insertedId, requestId }, 201);
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", { requestId }, status);
  }
}
