import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { SignJWT } from "jose";
import { parseToken } from "../verify/route";
import { COLLECTIONS } from "@/packages/core/src";
import { COLLECTION_TYPE } from "../../patients/signup-init/route";

export async function POST(req: NextRequest) {
  const db = await getDb();
  const { code } = await req.json().catch(() => ({}));

  const parsed = parseToken(code);

  if (!code || !parsed)
    return NextResponse.json({ error: "missing code" }, { status: 400 });

  const auth_tokens = db.collection(COLLECTIONS.AuthTokens);

  const auth_token_doc = await auth_tokens.findOne({
    type: COLLECTION_TYPE.OauthCode,
    id: parsed.id,
  });

  if (!auth_token_doc)
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 400 }
    );

  if (auth_token_doc.usedAt)
    return NextResponse.json(
      { ok: false, error: "already_used" },
      { status: 400 }
    );

  const exp =
    auth_token_doc.expiresAt instanceof Date
      ? auth_token_doc.expiresAt
      : new Date(auth_token_doc.expiresAt);
  if (isNaN(+exp) || new Date() > exp) {
    return NextResponse.json({ ok: false, error: "expired" }, { status: 400 });
  }

  const now = new Date();
  const mark = await auth_tokens.findOneAndUpdate(
    { _id: auth_token_doc._id, usedAt: null },
    { $set: { usedAt: now } },
    { returnDocument: "after" }
  );

  if (!mark)
    return NextResponse.json(
      { ok: false, error: "invalid_token" },
      { status: 400 }
    );

  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const jwt = await new SignJWT({
    sub: auth_token_doc.principalId,
    patientId: auth_token_doc.patientId,
    orgId: auth_token_doc.orgId,
    scopes: auth_token_doc.scopes,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  return NextResponse.json({ jwt });
}
