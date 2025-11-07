import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { SignJWT } from "jose";

import { COLLECTIONS } from "@/packages/core/src";
import { COLLECTION_TYPE } from "../../patients/signup-init/route";
import {
  AuthTokenDoc,
  consumeAuth,
  parseToken,
  validateAuth,
} from "@/apps/api/lib/auth/auth_token";

export async function POST(req: NextRequest) {
  const db = await getDb();
  const { code } = await req.json().catch(() => ({}));

  const parsed = parseToken(code);

  if (!code || !parsed)
    return NextResponse.json({ error: "missing code" }, { status: 400 });

  const auth_tokens = db.collection<AuthTokenDoc>(COLLECTIONS.AuthTokens);

  const res = await validateAuth(
    auth_tokens,
    COLLECTION_TYPE.OauthCode,
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

  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const jwt = await new SignJWT({
    sub: res.doc.principalId,
    patientId: res.doc.patientId,
    orgId: res.doc.orgId,
    scopes: res.doc.scopes,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  return NextResponse.json({ jwt });
}
