export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { ObjectId } from "mongodb";
import { COLLECTION_TYPE } from "../../patients/signup-init/route";
import { COLLECTIONS } from "@/packages/core/src";
import {
  AuthTokenDoc,
  b64url,
  consumeAuth,
  parseToken,
  setToken,
  validateAuth,
} from "@/apps/api/lib/auth/auth_token";

const EXPECTED = 32;

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
  const now = new Date();

  const new_auth_token_doc = {
    _id: new ObjectId(),
    type: COLLECTION_TYPE.OauthCode,
    id: b64url(id), // public lookup key
    secretHash: secretHash.toString("base64"),
    principalId: res.doc.principalId,
    patientId: res.doc._id,
    orgId: res.doc.orgId ?? null,
    scopes: res.doc.scopes, // consider narrowing
    createdAt: now,
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
    usedAt: null,
    redirectUri,
  };
  await auth_tokens.insertOne(new_auth_token_doc);

  const url = new URL(redirectUri);
  url.searchParams.set("code", token);
  return NextResponse.redirect(url);
}
