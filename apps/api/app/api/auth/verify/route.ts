export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { COLLECTION_TYPE } from "../../patients/signup-init/route";
import { COLLECTIONS, TUsersAccountCreate } from "@/packages/core/src";
import {
  AuthTokenDoc,
  b64url,
  consumeAuth,
  parseToken,
  setToken,
  validateAuth,
} from "@/apps/api/lib/auth/auth_token";

import { TUserPIICreate } from "@/packages/core/src/";

export async function GET(req: NextRequest) {
  const db = await getDb();
  const sp = req.nextUrl.searchParams;
  const rawToken = sp.get("token") ?? "";
  const parsed = parseToken(rawToken);
  if (!rawToken || !parsed) throw new Error("bad_token");
  const auth_tokens = db.collection<AuthTokenDoc>(COLLECTIONS.AuthTokens);

  const res = await validateAuth(
    auth_tokens,
    COLLECTION_TYPE.EmailVerify,
    parsed
  );

  if (!res.ok)
    return NextResponse.json({ ok: false, error: res.error }, { status: 400 });

  const { principalId, patientId, email, role, scopes, orgId } = res.doc;
  if (!email || !principalId)
    return NextResponse.json(
      { error: "missing information_v" },
      { status: 400 }
    );

  const now = new Date();
  const users_pii = db.collection(COLLECTIONS.UsersPII);
  const accounts = db.collection(COLLECTIONS.UsersAccounts);

  const base_user_acc = {
    email,
    principalId,
    role,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    scopes,
  };
  const user_pii_doc: TUserPIICreate = {
    ...base_user_acc,
    patientId,
    onboardingCompleted: false,
    onboardingSteps: [],
    emailVerifiedAt: now,
    pseudonymId: randomBytes(12).toString("hex"),
    lastActiveAt: now,
    status: "active",
  };

  const users_account_doc: TUsersAccountCreate = {
    ...base_user_acc,
    createdBy: principalId,
    updatedBy: principalId,
  };

  await users_pii.insertOne(user_pii_doc);
  await accounts.insertOne(users_account_doc);

  const consumed = await consumeAuth(auth_tokens, res.doc._id);

  if (!consumed.ok)
    return NextResponse.json(
      { ok: false, error: consumed.error },
      { status: 400 }
    );

  const redirectUri = res.doc.redirectUri;

  if (!redirectUri || redirectUri !== process.env.REDIRECT_URI) {
    return NextResponse.json(
      { ok: false, error: "Issue with params" },
      { status: 400 }
    );
  }

  const { id, token, secretHash } = setToken();

  const new_auth_token_doc = {
    _id: new ObjectId(),
    type: COLLECTION_TYPE.OauthCode,
    id: b64url(id), // public lookup key
    secretHash: secretHash.toString("base64"),
    principalId,
    patientId,
    orgId: res.doc.orgId ?? null,
    scopes, // consider narrowing
    role,
    email,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
    usedAt: null,
    redirectUri,
  };
  await auth_tokens.insertOne(new_auth_token_doc);

  const url = new URL(redirectUri);
  url.searchParams.set("token", token);
  return NextResponse.redirect(url);
}
