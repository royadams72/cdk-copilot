export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { ObjectId } from "mongodb";
import { COLLECTION_TYPE } from "@/apps/api/lib/auth/collectionType";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { COLLECTIONS } from "@ckd/core/server";
import {
  AuthTokenDoc,
  b64url,
  consumeAuth,
  parseToken,
  setToken,
  validateAuth,
} from "@/apps/api/lib/auth/auth_token";

import { DEFAULT_SCOPES, TUserPIICreate, TUsersAccountCreate } from "@ckd/core";
import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { bad } from "@/apps/api/lib/http/responses";

export async function GET(req: NextRequest) {
  const user = await requireUser(req, DEFAULT_SCOPES, {
    allowBootstrap: true,
  });

  if (!user) return bad("Forbidden", "", 403);
  // console.log("verify user:: ", user);

  const db = await getDb();
  const sp = req.nextUrl.searchParams;
  const rawToken = sp.get("token") ?? "";
  const parsed = parseToken(rawToken);

  if (!rawToken || !parsed) throw new Error("bad_token");
  const auth_tokens = db.collection<AuthTokenDoc>(COLLECTIONS.AuthTokens);

  const res = await validateAuth(
    auth_tokens,
    COLLECTION_TYPE.EmailVerify,
    parsed,
  );

  if (!res.ok)
    return NextResponse.json({ error: res.error, ok: false }, { status: 400 });

  const { principalId, patientId, email, role, scopes } = res.doc;

  if (!email || !principalId)
    return NextResponse.json(
      { error: "missing information_v" },
      { status: 400 },
    );

  const tokenPatientId: ObjectId =
    typeof patientId === "string" ? new ObjectId(patientId) : patientId;
  const emailLower = email.trim().toLowerCase();

  const now = new Date();
  const users_pii = db.collection(COLLECTIONS.UsersPII);
  const accounts = db.collection(COLLECTIONS.UsersAccounts);

  const existingPii = await users_pii.findOne(
    { email: emailLower },
    {
      collation: { locale: "en", strength: 2 },
      projection: { patientId: 1, principalId: 1 },
    },
  );
  const existingAccount = await accounts.findOne(
    { isActive: true, principalId },
    { projection: { principalId: 1 } },
  );

  const base_user_acc = {
    createdAt: now,
    email: emailLower,
    isActive: true,
    principalId,
    role,
    scopes,
    updatedAt: now,
  };

  const user_pii_dto: TUserPIICreate = {
    ...base_user_acc,
    emailVerifiedAt: now,
    lastActiveAt: now,
    onboardingCompleted: false,
    onboardingSteps: [],
    patientId: tokenPatientId.toHexString(),
    pseudonymId: `ps_${randomBytes(12).toString("hex")}`,
    status: "active",
  };

  const users_account_doc: TUsersAccountCreate = {
    ...base_user_acc,
    createdBy: principalId,
    updatedBy: principalId,
  };

  // New-user provisioning path. Existing records are treated as idempotent no-op.
  if (!existingPii) {
    await users_pii.insertOne({
      ...user_pii_dto,
      ...(res.doc.orgId ? { orgId: res.doc.orgId } : {}),
      patientId: tokenPatientId,
    });
  }
  if (!existingAccount) {
    await accounts.insertOne(users_account_doc);
  }

  const consumed = await consumeAuth(auth_tokens, res.doc._id);

  if (!consumed.ok)
    return NextResponse.json(
      { error: consumed.error, ok: false },
      { status: 400 },
    );

  const redirectUri = res.doc.redirectUri;

  if (!redirectUri || redirectUri !== process.env.REDIRECT_URI) {
    return NextResponse.json(
      { error: "Issue with params", ok: false },
      { status: 400 },
    );
  }

  const { id, token, secretHash } = setToken();

  const new_auth_token_doc = {
    _id: new ObjectId(),
    type: COLLECTION_TYPE.OauthCode,
    id: b64url(id), // public lookup key
    secretHash: secretHash.toString("base64"),
    principalId,
    patientId: tokenPatientId,
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
