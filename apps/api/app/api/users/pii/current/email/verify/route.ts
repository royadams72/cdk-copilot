import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { parseToken } from "@/apps/api/lib/auth/auth_token";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { COLLECTIONS } from "@ckd/core/server";

export const runtime = "nodejs";

function page(title: string, message: string, status = 200) {
  return new NextResponse(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>${title}</title></head><body style="font-family:system-ui;max-width:36rem;margin:4rem auto;padding:1rem"><h1>${title}</h1><p>${message}</p></body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(req: NextRequest) {
  const parsed = parseToken(req.nextUrl.searchParams.get("token") || "");
  if (!parsed) return page("Invalid link", "This verification link is not valid.", 400);

  const db = await getDb();
  const collection = db.collection(COLLECTIONS.EmailVerifications);
  const doc = await collection.findOne({ id: parsed.id, purpose: "email_change" });
  if (!doc || doc.usedAt || new Date(doc.expiresAt).getTime() < Date.now()) return page("Link unavailable", "This verification link has expired or has already been used.", 400);

  const pepper = Buffer.from(process.env.AUTH_TOKEN_PEPPER || "", "base64");
  if (pepper.length < 32) return page("Unable to verify", "Email verification is temporarily unavailable.", 500);
  const expected = Buffer.from(doc.secretHash, "base64");
  const actual = createHmac("sha256", pepper).update(parsed.secret).digest();
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return page("Invalid link", "This verification link is not valid.", 400);

  const now = new Date();
  const duplicate = await db.collection(COLLECTIONS.UsersPII).findOne({ email: doc.email, principalId: { $ne: doc.principalId } }, { collation: { locale: "en", strength: 2 }, projection: { _id: 1 } });
  if (duplicate) return page("Email unavailable", "That email address is already connected to another account.", 409);

  const consumed = await collection.updateOne({ _id: doc._id, usedAt: null }, { $set: { usedAt: now } });
  if (!consumed.modifiedCount) return page("Link unavailable", "This verification link has already been used.", 400);

  await Promise.all([
    db.collection(COLLECTIONS.UsersPII).updateOne({ principalId: doc.principalId }, { $set: { email: doc.email, emailVerifiedAt: now, updatedAt: now } }),
    db.collection(COLLECTIONS.UsersAccounts).updateOne({ principalId: doc.principalId }, { $set: { email: doc.email, updatedAt: now, updatedBy: doc.principalId } }),
    db.collection(COLLECTIONS.AuthLinks).updateMany({ active: true, principalId: doc.principalId }, { $set: { email: doc.email } }),
    db.collection(COLLECTIONS.AuthTokens).updateMany({ principalId: doc.principalId, usedAt: null }, { $set: { usedAt: now } }),
  ]);
  return page("Email confirmed", "Your email address has been updated. You can return to CKD Copilot.");
}
