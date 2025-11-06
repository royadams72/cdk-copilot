import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { randomBytes, createHash, createHmac } from "crypto";
import { Resend } from "resend"; // or Nodemailer if you prefer
import { WithImplicitCoercion } from "buffer";
import { COLLECTIONS } from "@/packages/core/src";
export const runtime = "nodejs";

export type colType = "oauth_code" | "email_verify" | "password_reset";
export enum COLLECTION_TYPE {
  OauthCode = "oauth_code",
  EmailVerify = "email_verify",
  PasswordReset = "password_reset",
}
const Body = z.object({ email: z.email() });

const DEFAULT_SCOPES = ["patients.read", "patients.flags.write"] as const;
const RESEND_KEY = process.env.RESEND_API_KEY || "";
const resend = RESEND_KEY ? new Resend(RESEND_KEY) : null;
const VERIFY_URL = (process.env.VERIFY_URL as unknown as URL) || null;
const REDIRECT_URI = process.env.REDIRECT_URI || null;
const EMAIL_FROM = process.env.EMAIL_FROM || null;
const PEPPER = process.env.AUTH_TOKEN_PEPPER || null;
const APP_ORIGIN = process.env.APP_ORIGIN || null;

function hmac(secretBytes: Buffer) {
  if (!PEPPER) {
    throw new Error("AUTH_TOKEN_PEPPER is not set");
  }
  return createHmac("sha256", Buffer.from(PEPPER, "base64"))
    .update(secretBytes)
    .digest();
}

function b64url(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const body = await req.json().catch(() => null);
    const parsed = Body.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    if (!VERIFY_URL || !REDIRECT_URI || !EMAIL_FROM || !APP_ORIGIN) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_params: env",
        },
        { status: 400 }
      );
    }
    const { email } = parsed.data;

    // Create patient record
    const patients = db.collection(COLLECTIONS.Patients);
    const auth_tokens = db.collection("auth_tokens");

    // Generate identifiers
    const patientId = new ObjectId();
    const principalId = `pr_${randomBytes(12).toString("hex")}`;
    const scopes = [...DEFAULT_SCOPES];
    const now = new Date();

    const patientDoc = {
      _id: patientId, // Primary Key
      principalId, // app generated
      scopes, // minimal scopes at signup
      orgId: "", // or null/undefined if unknown
      summary: {}, // empty at this stage
      flags: [],
      createdAt: now,
      updatedAt: now,
    };

    // Insert patient

    await patients.insertOne(patientDoc);

    // Issue verification token
    const id = randomBytes(16); // 128-bit lookup key
    const secret = randomBytes(32); // 256-bit secret
    const secretHash = hmac(secret);
    const token = `${b64url(id)}.${b64url(secret)}`; // send this
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes

    const auth_tokens_doc = {
      _id: new ObjectId(),
      type: COLLECTION_TYPE.EmailVerify,
      id: b64url(id),
      email,
      redirectUri: REDIRECT_URI,
      secretHash: secretHash.toString("base64"),
      patientId,
      principalId,
      scopes,
      expiresAt,
      usedAt: null as Date | null,
      createdAt: now,
    };
    await auth_tokens.insertOne(auth_tokens_doc);
    // ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`
    const base = APP_ORIGIN;
    const verifyUrl = new URL(VERIFY_URL, base);
    verifyUrl.searchParams.set("token", token);

    // Resend example. Replace with your sender and template as needed.
    if (resend) {
      await resend.emails.send({
        from: EMAIL_FROM,
        to: email,
        subject: "Confirm your email",
        html: `
        <p>Confirm your email to continue.</p>
        <p><a href="${verifyUrl.toString()}">Verify email</a></p>
        <p>This link expires at ${expiresAt.toISOString()}.</p>
      `,
      });
    } else {
      console.log(
        "[DEV] Email disabled. Verification link:",
        verifyUrl.toString()
      );
    }

    return NextResponse.json({ status: "ok" });
  } catch (e: any) {
    console.error(
      "There was an error",
      JSON.stringify(e?.errInfo ?? e, null, 2)
    );
    return NextResponse.json(
      { error: "validation_failed", info: e?.errInfo },
      { status: 400 }
    );
  }
}
