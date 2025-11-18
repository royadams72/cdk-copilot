// app/api/users/pii/route.ts
import { NextRequest } from "next/server";
import { treeifyError } from "zod";
import { COLLECTIONS, getCollection } from "@ckd/core/server";

import { getDb } from "@/apps/api/lib/db/mongodb";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { ok, bad } from "@/apps/api/lib/http/responses";
import { requireUser, SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import { SCOPES, TUserPII, UserPII_Base, UserPII_Create } from "@ckd/core";
import { ObjectId } from "mongodb";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const requestId = makeRandomId();

  try {
    const user: SessionUser = await requireUser(
      req,
      SCOPES.USERS_CLINICAL_WRITE
    );

    const body = await req.json();
    const createDto = UserPII_Create.parse(body);
    if (!createDto) {
      return bad("Validation failed", "", 400);
    }

    const now = new Date();
    const insertDto: TUserPII = UserPII_Base.parse({
      ...createDto,
      createdAt: now,
      updatedAt: now,
    });

    const db = await getDb();

    const dbDoc = {
      ...insertDto,
      patientId: new ObjectId(insertDto.patientId),
    };
    const collection = getCollection<TUserPII>(db, COLLECTIONS.UsersPII);

    const { insertedId } = await collection.insertOne(dbDoc as any);

    return ok({ _id: insertedId, requestId }, 201);
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", { requestId }, status);
  }
}
