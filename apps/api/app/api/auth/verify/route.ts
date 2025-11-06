export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { ObjectId } from "mongodb";
import { COLLECTION_TYPE } from "../../patients/signup-init/route";
import { COLLECTIONS } from "@/packages/core/src";

const EXPECTED = 32;
const PEPPER_B64 = process.env.AUTH_TOKEN_PEPPER || "";
if (!PEPPER_B64) throw new Error("AUTH_TOKEN_PEPPER missing");
const PEPPER = Buffer.from(PEPPER_B64, "base64");
if (PEPPER.length < 32) throw new Error("AUTH_TOKEN_PEPPER too short");

export function parseToken(raw: string) {
  const [idB64, secB64] = raw.split(".");
  if (!idB64 || !secB64) return null;
  const toBuf = (s: string) =>
    Buffer.from(
      s.replace(/-/g, "+").replace(/_/g, "/") + "==".slice((s.length + 3) % 4),
      "base64"
    );
  return { id: idB64, secret: toBuf(secB64) };
}

function b64url(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function mac(buf: Buffer) {
  return createHmac("sha256", PEPPER).update(buf).digest(); // 32 bytes
}

export async function GET(req: NextRequest) {
  const db = await getDb();
  const sp = req.nextUrl.searchParams;
  const rawToken = sp.get("token") ?? "";
  const parsed = parseToken(rawToken);
  if (!rawToken || !parsed) throw new Error("bad_token");
  const auth_tokens = db.collection(COLLECTIONS.AuthTokens);

  const auth_token_doc = await auth_tokens.findOne({
    type: "email_verify",
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

  let storedSecret = Buffer.from(auth_token_doc.secretHash, "base64");
  const lenOK = storedSecret.length === EXPECTED;

  /* This equalises the length of storedSecret if !lenOK,
  this makes sure the error is returned in equal time to guard against time bases attacks*/

  if (!lenOK) storedSecret = Buffer.alloc(EXPECTED);

  const presented = createHmac(
    "sha256",
    Buffer.from(process.env.AUTH_TOKEN_PEPPER!, "base64")
  )
    .update(parsed.secret)
    .digest();

  const ok = lenOK && timingSafeEqual(storedSecret, presented); // both 32 bytes, constant-time
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "invalid_token" },
      { status: 400 }
    );
  }

  const redirectUri = auth_token_doc.redirectUri;

  if (!redirectUri || redirectUri !== process.env.REDIRECT_URI) {
    return NextResponse.json(
      { ok: false, error: "Issue with params" },
      { status: 400 }
    );
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

  const codeId = randomBytes(16); // 128-bit
  const codeSecret = randomBytes(32); // 256-bit
  const codeHashB64 = mac(codeSecret).toString("base64");
  const codeToken = `${b64url(codeId)}.${b64url(codeSecret)}`; // send this

  const new_auth_token_doc = {
    _id: new ObjectId(),
    type: COLLECTION_TYPE.OauthCode,
    id: b64url(codeId), // public lookup key
    secretHash: codeHashB64, // constant-time compare later
    principalId: auth_token_doc.principalId,
    patientId: auth_token_doc._id,
    orgId: auth_token_doc.orgId ?? null,
    scopes: auth_token_doc.scopes, // consider narrowing
    createdAt: now,
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
    usedAt: null,
    clientId: auth_token_doc.clientId ?? null,
    redirectUri,
  };
  await auth_tokens.insertOne(new_auth_token_doc);

  const url = new URL(redirectUri);
  url.searchParams.set("code", codeToken);
  return NextResponse.redirect(url);
}
