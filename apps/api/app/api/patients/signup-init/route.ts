export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";

import { randomBytes } from "crypto";
import { Resend } from "resend";
import { ObjectId } from "mongodb";
import { z } from "zod";

import { getDb } from "@/apps/api/lib/db/mongodb";
import { AuthTokenDoc, b64url, setToken } from "@/apps/api/lib/auth/auth_token";
import { COLLECTIONS } from "@ckd/core/server";
import {
  ROLES,
  DEFAULT_SCOPES,
  EmailLower,
  TUsersAccount,
  TUserPII,
} from "@ckd/core";
import { bad, ok } from "@/apps/api/lib/http/responses";

export type colType = "oauth_code" | "email_verify" | "password_reset";
export enum COLLECTION_TYPE {
  OauthCode = "oauth_code",
  EmailVerify = "email_verify",
  PasswordReset = "password_reset",
  Refresh = "refresh",
}
const Body = z.object({ email: z.email() });

const RESEND_KEY = process.env.RESEND_API_KEY || "";
const resend = RESEND_KEY ? new Resend(RESEND_KEY) : null;
const VERIFY_URL = (process.env.VERIFY_URL as unknown as URL) || null;
const REDIRECT_URI = process.env.REDIRECT_URI || null;
const EMAIL_FROM = process.env.EMAIL_FROM || null;
const APP_ORIGIN = process.env.APP_ORIGIN || null;

export async function POST(req: NextRequest) {
  try {
    // TODO create one off guard with server secret for first time signup
    // const user = await requireUser(req, [SCOPES.AUTH_TOKENS_ISSUE], {
    //   allowBootstrap: true,
    // });

    const db = await getDb();

    const body = await req.json().catch(() => null);
    const parsed = Body.safeParse(body);
    // console.log(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    if (!VERIFY_URL || !REDIRECT_URI || !EMAIL_FROM || !APP_ORIGIN) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_params: env",
        },
        { status: 400 },
      );
    }
    const { email } = parsed.data;

    // Create patient record
    const patients = db.collection(COLLECTIONS.Patients);
    const auth_tokens = db.collection(COLLECTIONS.AuthTokens);
    const users_pii = db.collection(COLLECTIONS.UsersPII);
    // Check that patients does not exist

    // const isUserActive = await users_pii.findOne<TUserPII>(
    //   { email },
    //   { projection: { _id: 1 } },
    // );

    // if (isUserActive) {
    //   return bad("User already exists", 500);
    // }
    // Generate identifiers
    const patientId = new ObjectId();
    const principalId = `pr_${randomBytes(12).toString("hex")}`;
    const scopes = [...DEFAULT_SCOPES];
    const now = new Date();

    const patientDoc = {
      _id: patientId,
      principalId,
      orgId: "",
      summary: {},
      flags: [],
      createdAt: now,
      updatedAt: now,
    };

    // Insert patient

    await patients.insertOne(patientDoc);

    // Issue verification token
    const { id, token, secretHash } = setToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

    const auth_tokens_doc: AuthTokenDoc = {
      _id: new ObjectId(),
      type: COLLECTION_TYPE.EmailVerify,
      id: b64url(id),
      email,
      redirectUri: REDIRECT_URI,
      secretHash: secretHash.toString("base64"),
      patientId: new ObjectId(patientId),
      principalId,
      role: ROLES.Patient,
      scopes,
      expiresAt,
      usedAt: null as Date | null,
      createdAt: now,
    };

    await auth_tokens.insertOne(auth_tokens_doc);

    const base = APP_ORIGIN;
    const verifyUrl = new URL(VERIFY_URL, base);
    verifyUrl.searchParams.set("token", token);

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
        verifyUrl.toString(),
      );
    }

    return NextResponse.json({ status: "ok" });
  } catch (e: any) {
    console.error(
      "There was an error",
      JSON.stringify(e?.errInfo ?? e, null, 2),
    );
    return NextResponse.json(
      { error: "validation_failed", info: e?.errInfo },
      { status: 400 },
    );
  }
}
