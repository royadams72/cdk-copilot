import { randomBytes, randomInt, timingSafeEqual } from "crypto";

import { Collection } from "mongodb";

import { COLLECTION_TYPE } from "@/apps/api/lib/auth/collectionType";
import { AuthTokenDoc, b64url, hmac } from "@/apps/api/lib/auth/auth_token";

export function createPortalLoginCode() {
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const id = b64url(randomBytes(16));
  const secretHash = hmac(Buffer.from(code, "utf8")).toString("base64");
  return { code, id, secretHash };
}

export async function invalidatePortalLoginCodes(
  authTokens: Collection<AuthTokenDoc>,
  email: string,
  principalId: string,
  now: Date,
) {
  await authTokens.updateMany(
    {
      email,
      principalId,
      type: COLLECTION_TYPE.PortalLoginCode,
      usedAt: null,
    },
    {
      $set: {
        usedAt: now,
      },
    },
  );
}

export async function validatePortalLoginCode(
  authTokens: Collection<AuthTokenDoc>,
  args: {
    code: string;
    email: string;
    principalId: string;
  },
) {
  const doc = await authTokens.findOne(
    {
      email: args.email,
      expiresAt: { $gt: new Date() },
      principalId: args.principalId,
      type: COLLECTION_TYPE.PortalLoginCode,
      usedAt: null,
    },
    { sort: { createdAt: -1 } },
  );

  if (!doc) {
    return { ok: false as const, reason: "not_found" };
  }

  const stored = Buffer.from(doc.secretHash, "base64");
  const presented = hmac(Buffer.from(args.code, "utf8"));

  if (stored.length !== presented.length || !timingSafeEqual(stored, presented)) {
    return { ok: false as const, reason: "invalid_code" };
  }

  const result = await authTokens.updateOne(
    { _id: doc._id, usedAt: null },
    { $set: { usedAt: new Date() } },
  );

  if (result.modifiedCount !== 1) {
    return { ok: false as const, reason: "already_used" };
  }

  return { ok: true as const, doc };
}
