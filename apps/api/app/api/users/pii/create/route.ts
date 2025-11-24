import { NextRequest } from "next/server";
import { treeifyError } from "zod";
import type { Document as MongoDocument } from "mongodb";

import { COLLECTIONS, getCollection } from "@ckd/core/server";

import { getDb } from "@/apps/api/lib/db/mongodb";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { ok, bad } from "@/apps/api/lib/http/responses";
import { requireUser, SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import {
  DEFAULT_SCOPES,
  PiiForm,
  SCOPES,
  STEP2,
  TUserPII,
  UserPII_Create,
} from "@ckd/core";
import { updateScopes } from "@/apps/api/lib/utils/updateScopes";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const requestId = makeRandomId();

  try {
    const user: SessionUser = await requireUser(req, STEP2);

    const body = await req.json();

    const parsed = PiiForm.safeParse(body);
    if (!parsed.success) {
      return bad("Validation failed", treeifyError(parsed.error));
    }

    const now = new Date();

    const doc = {
      ...body,
      ...(user.orgId ? { orgId: user.orgId } : {}),
      updatedAt: now,
    } as any;

    const database = await getDb();
    const userPII_db = getCollection(database, COLLECTIONS.UsersPII);

    await userPII_db.updateOne(
      { patientId: user.patientId },
      {
        $set: doc,
      }
    );

    await updateScopes(user, [
      SCOPES.USERS_CLINICAL_WRITE,
      SCOPES.USERS_CLINICAL_READ,
    ]);

    return ok({ requestId }, 201);
  } catch (err: any) {
    const status = err?.code === 121 ? 400 : err?.status || 500;
    return bad(err?.message || "Server error", { requestId }, status);
  }
}
