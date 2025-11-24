import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { Collection, WithId, ObjectId } from "mongodb";
import { Role } from "@ckd/core";

const EXPECTED = 32; // HMAC-SHA256
const PEPPER_B64 = process.env.AUTH_TOKEN_PEPPER || "";
if (!PEPPER_B64) throw new Error("AUTH_TOKEN_PEPPER missing");
const PEPPER = Buffer.from(PEPPER_B64, "base64");
if (PEPPER.length < 32) throw new Error("AUTH_TOKEN_PEPPER too short");

export function constantTimeCheck(
  storedB64: string,
  presentedSecret: Buffer,
  pepperB64: string
) {
  const presentedMac = createHmac("sha256", Buffer.from(pepperB64, "base64"))
    .update(presentedSecret)
    .digest(); // 32 bytes

  let stored = Buffer.from(storedB64, "base64");
  const lenOK = stored.length === EXPECTED;
  if (!lenOK) stored = Buffer.alloc(EXPECTED); // normalize length

  const eq = timingSafeEqual(stored, presentedMac); // constant-time compare
  return lenOK && eq; // never true if length was wrong
}

export function hmac(secretBytes: Buffer) {
  if (!PEPPER) {
    throw new Error("AUTH_TOKEN_PEPPER is not set");
  }
  return createHmac("sha256", PEPPER).update(secretBytes).digest();
}

export function b64url(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

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

export function setToken() {
  const id = randomBytes(16);
  const secret = randomBytes(32);
  const secretHash = hmac(secret);
  const token = `${b64url(id)}.${b64url(secret)}`;
  return { id, token, secretHash };
}

// auth_tokens.validate.ts

export type ColType = "oauth_code" | "email_verify" | "password_reset";

export type AuthTokenDoc = {
  _id: ObjectId;
  type: ColType;
  id: string; // base64url
  secretHash: string; // base64 of 32-byte HMAC
  patientId: ObjectId;
  principalId?: string;
  orgId?: string | null;
  email?: string;
  redirectUri?: string | null;
  scopes?: string[];
  role: Role;
  createdAt: Date;
  expiresAt: Date;
  usedAt?: Date | null;
};

type Parsed = { id: string; secret: Buffer };

type ValidateResult =
  | { ok: true; doc: WithId<AuthTokenDoc> }
  | {
      ok: false;
      error: "not_found" | "already_used" | "expired" | "invalid_token";
    };

/** Constant-time validation only. Does NOT mutate the DB. */
export async function validateAuth(
  collection: Collection<AuthTokenDoc>,
  type: ColType,
  parsedToken: Parsed
): Promise<ValidateResult> {
  const doc = await collection.findOne({ type, id: parsedToken.id });
  if (!doc) return { ok: false, error: "not_found" };

  if (doc.usedAt) return { ok: false, error: "already_used" };

  const exp =
    doc.expiresAt instanceof Date ? doc.expiresAt : new Date(doc.expiresAt);
  if (!exp || Number.isNaN(+exp) || Date.now() > +exp)
    return { ok: false, error: "expired" };

  // Normalize stored hash length so timing is uniform
  let stored = Buffer.from(doc.secretHash, "base64");
  const lenOK = stored.length === EXPECTED;
  if (!lenOK) stored = Buffer.alloc(EXPECTED);

  const presented = hmac(parsedToken.secret); // always 32 bytes

  const match = lenOK && timingSafeEqual(stored, presented);
  if (!match) return { ok: false, error: "invalid_token" };

  return { ok: true, doc };
}

/** Atomically marks the token as used to prevent replay. Call after validateAuth ok=true. */
export async function consumeAuth(
  collection: Collection<AuthTokenDoc>,
  docId: ObjectId,
  when = new Date()
): Promise<
  { ok: true; doc: WithId<AuthTokenDoc> } | { ok: false; error: "already_used" }
> {
  const res = await collection.findOneAndUpdate(
    { _id: docId, usedAt: null },
    { $set: { usedAt: when } },
    { returnDocument: "after" }
  );
  if (!res) return { ok: false, error: "already_used" };
  return { ok: true, doc: res };
}
