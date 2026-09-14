import { createHmac, randomBytes } from "crypto";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { Resend } from "resend";
import { z } from "zod";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { enforceRateLimit, getClientIp } from "@/apps/api/lib/auth/rateLimit";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, badFromError, ok } from "@/apps/api/lib/http/responses";
import { COLLECTIONS } from "@ckd/core/server";

export const runtime = "nodejs";

const Body = z.object({ email: z.email().transform((value) => value.trim().toLowerCase()) });
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function base64url(value: Buffer) {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function tokenHash(secret: Buffer) {
  const pepper = Buffer.from(process.env.AUTH_TOKEN_PEPPER || "", "base64");
  if (pepper.length < 32) throw new Error("AUTH_TOKEN_PEPPER missing or too short");
  return createHmac("sha256", pepper).update(secret).digest("base64");
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user.patientId || !ObjectId.isValid(user.patientId)) return bad("Patient context missing", undefined, 403);
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return bad("Enter a valid email address", undefined, 400);
    await enforceRateLimit([
      { bucket: "email_change_ip", key: getClientIp(req), limit: 10, windowMs: 15 * 60_000 },
      { bucket: "email_change_principal", key: user.principalId, limit: 5, windowMs: 15 * 60_000 },
    ]);

    const db = await getDb();
    const email = parsed.data.email;
    const existing = await db.collection(COLLECTIONS.UsersPII).findOne(
      { email, principalId: { $ne: user.principalId } },
      { collation: { locale: "en", strength: 2 }, projection: { _id: 1 } },
    );
    if (existing) return bad("That email address is already in use", undefined, 409);

    const id = randomBytes(16);
    const secret = randomBytes(32);
    const token = `${base64url(id)}.${base64url(secret)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60_000);
    const collection = db.collection(COLLECTIONS.EmailVerifications);
    await collection.updateMany({ principalId: user.principalId, purpose: "email_change", usedAt: null }, { $set: { usedAt: now } });
    await collection.insertOne({
      createdAt: now,
      email,
      expiresAt,
      id: base64url(id),
      patientId: new ObjectId(user.patientId),
      principalId: user.principalId,
      purpose: "email_change",
      secretHash: tokenHash(secret),
      usedAt: null,
    });

    const origin = process.env.APP_ORIGIN || req.nextUrl.origin;
    const verifyUrl = new URL("/api/users/pii/current/email/verify", origin);
    verifyUrl.searchParams.set("token", token);
    let devLink: string | undefined;
    if (resend && process.env.EMAIL_FROM) {
      await resend.emails.send({
        from: process.env.EMAIL_FROM,
        html: `<p>Confirm this email address for your CKD Copilot account.</p><p><a href="${verifyUrl.toString()}">Confirm email address</a></p><p>This link expires in 30 minutes. If you did not request this change, ignore this email.</p>`,
        subject: "Confirm your new CKD Copilot email",
        to: email,
      });
    } else if (process.env.NODE_ENV !== "production") {
      devLink = verifyUrl.toString();
      console.log("[DEV] Email change verification link for", email, "=", devLink);
    } else {
      return bad("Email delivery is not configured", undefined, 503);
    }

    return ok({ ...(devLink ? { devLink } : {}), pendingEmail: email }, 202);
  } catch (error) {
    return badFromError(error, "Unable to send verification email");
  }
}
