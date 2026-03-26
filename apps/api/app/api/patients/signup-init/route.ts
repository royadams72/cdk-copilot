export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";

import { randomBytes } from "crypto";
import { Resend } from "resend";
import { ObjectId } from "mongodb";
import { z } from "zod";

import { COLLECTION_TYPE } from "@/apps/api/lib/auth/collectionType";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { AuthTokenDoc, b64url, setToken } from "@/apps/api/lib/auth/auth_token";
import { COLLECTIONS } from "@ckd/core/server";
import { DEFAULT_SCOPES, ROLES, TUsersAccount } from "@ckd/core";
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
          error: "missing_params: env",
          ok: false,
        },
        { status: 400 },
      );
    }
    const email = parsed.data.email.trim().toLowerCase();

    // Create patient record
    const patients = db.collection(COLLECTIONS.Patients);
    const auth_tokens = db.collection(COLLECTIONS.AuthTokens);
    const users_pii = db.collection(COLLECTIONS.UsersPII);
    const accounts = db.collection<TUsersAccount>(COLLECTIONS.UsersAccounts);

    const now = new Date();
    const scopes = [...DEFAULT_SCOPES];

    const existingPii = await users_pii.findOne(
      { email },
      {
        collation: { locale: "en", strength: 2 },
        projection: { patientId: 1, principalId: 1, role: 1, scopes: 1 },
      },
    );

    const existingAccountByEmail = await accounts.findOne(
      { isActive: true, email },
      {
        collation: { locale: "en", strength: 2 },
        projection: { principalId: 1, role: 1, scopes: 1 },
      },
    );

    const patientByPiiId =
      existingPii?.patientId instanceof ObjectId
        ? await patients.findOne(
            { _id: existingPii.patientId },
            { projection: { _id: 1, principalId: 1 } },
          )
        : null;

    const principalCandidate =
      existingPii?.principalId ?? existingAccountByEmail?.principalId;

    const existingAccount = principalCandidate
      ? await accounts.findOne(
          {
            isActive: true,
            principalId: principalCandidate,
          },
          {
            collation: { locale: "en", strength: 2 },
            projection: { principalId: 1, role: 1, scopes: 1 },
          },
        )
      : null;

    const pendingAuth = await auth_tokens.findOne(
      {
        email,
        usedAt: null,
        type: {
          $in: [COLLECTION_TYPE.EmailVerify, COLLECTION_TYPE.OauthCode],
        },
      },
      {
        sort: { createdAt: -1 },
        projection: { patientId: 1, principalId: 1, role: 1, scopes: 1 },
      },
    );

    let principalId =
      (existingAccount?.principalId as string | undefined) ??
      (existingAccountByEmail?.principalId as string | undefined) ??
      (existingPii?.principalId as string | undefined) ??
      (patientByPiiId?.principalId as string | undefined) ??
      (pendingAuth?.principalId as string | undefined) ??
      `pr_${randomBytes(12).toString("hex")}`;

    const patientByPrincipal = await patients.findOne(
      { principalId },
      { projection: { _id: 1 } },
    );

    let patientId =
      (existingPii?.patientId as ObjectId | undefined) ??
      (patientByPrincipal?._id as ObjectId | undefined) ??
      (patientByPiiId?._id as ObjectId | undefined) ??
      (pendingAuth?.patientId as ObjectId | undefined) ??
      new ObjectId();

    let role =
      (existingAccount?.role as any) ??
      (existingAccountByEmail?.role as any) ??
      ((existingPii as any)?.role as any) ??
      ((pendingAuth as any)?.role as any) ??
      ROLES.Patient;

    const effectiveScopes = existingAccount?.scopes?.length
      ? existingAccount.scopes
      : existingAccountByEmail?.scopes?.length
        ? existingAccountByEmail.scopes
      : Array.isArray((existingPii as any)?.scopes) &&
          (existingPii as any).scopes.length
        ? (existingPii as any).scopes
        : Array.isArray((pendingAuth as any)?.scopes) &&
            (pendingAuth as any).scopes.length
          ? (pendingAuth as any).scopes
        : scopes;

    const isExistingIdentity = Boolean(
      existingPii ||
        existingAccount ||
        existingAccountByEmail ||
        patientByPiiId ||
        patientByPrincipal ||
        pendingAuth,
    );

    if (existingPii && !existingAccount) {
      await accounts.updateOne(
        { principalId },
        {
          $set: {
            email,
            isActive: true,
            role,
            scopes: effectiveScopes,
            updatedAt: now,
            updatedBy: principalId,
          },
          $setOnInsert: {
            principalId,
            createdAt: now,
            createdBy: principalId,
          },
        },
        { upsert: true },
      );
    }

    try {
      await patients.updateOne(
        { _id: patientId },
        {
          $set: { updatedAt: now },
          $setOnInsert: {
            _id: patientId,
            createdAt: now,
            flags: [],
            orgId: "",
            principalId,
            summary: {},
          },
        },
        { upsert: true },
      );
    } catch (error: any) {
      // Legacy or partially-provisioned users can already have a patient row for
      // this principalId even if our earlier email-based lookups missed it.
      if (error?.code !== 11000 || error?.keyPattern?.principalId !== 1) {
        throw error;
      }

      const patientByPrincipalConflict = await patients.findOne(
        { principalId },
        { projection: { _id: 1 } },
      );

      if (!patientByPrincipalConflict?._id) {
        throw error;
      }

      patientId = patientByPrincipalConflict._id as ObjectId;

      await patients.updateOne(
        { _id: patientId },
        { $set: { updatedAt: now } },
      );
    }

    // Existing identity (account and/or pii): email a direct oauth-code sign-in link.
    if (isExistingIdentity) {
      // Invalidate older unconsumed oauth-code links so only the newest sign-in link is valid.
      await auth_tokens.updateMany(
        {
          type: COLLECTION_TYPE.OauthCode,
          email,
          usedAt: null,
        },
        { $set: { usedAt: now } },
      );

      const { id, token, secretHash } = setToken();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 30);
      const auth_tokens_doc: AuthTokenDoc = {
        id: b64url(id),
        _id: new ObjectId(),
        type: COLLECTION_TYPE.OauthCode,
        createdAt: now,
        email,
        expiresAt,
        patientId,
        principalId,
        redirectUri: REDIRECT_URI,
        role,
        scopes: effectiveScopes,
        secretHash: secretHash.toString("base64"),
        usedAt: null as Date | null,
      };
      await auth_tokens.insertOne(auth_tokens_doc);

      const signInUrl = new URL(REDIRECT_URI);
      signInUrl.searchParams.set("token", token);
      if (resend) {
        await resend.emails.send({
          from: EMAIL_FROM,
          html: `
          <p>Use this secure link to sign in.</p>
          <p><a href="${signInUrl.toString()}">Sign in</a></p>
          <p>This link expires at ${expiresAt.toISOString()}.</p>
        `,
          subject: "Sign in to CKD Copilot",
          to: email,
        });
      } else {
        console.log(
          "[DEV] Email disabled. Sign-in link:",
          signInUrl.toString(),
        );
      }

      return NextResponse.json({ existingUser: true, status: "ok" });
    }

    // New user: issue verification token and continue provisioning via /api/auth/verify.
    // Invalidate older unconsumed verification links so only the newest verify link is valid.
    await auth_tokens.updateMany(
      {
        type: COLLECTION_TYPE.EmailVerify,
        email,
        usedAt: null,
      },
      { $set: { usedAt: now } },
    );

    const { id, token, secretHash } = setToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

    const auth_tokens_doc: AuthTokenDoc = {
      id: b64url(id),
      _id: new ObjectId(),
      type: COLLECTION_TYPE.EmailVerify,
      createdAt: now,
      email,
      expiresAt,
      patientId,
      principalId,
      redirectUri: REDIRECT_URI,
      role,
      scopes: effectiveScopes,
      secretHash: secretHash.toString("base64"),
      usedAt: null as Date | null,
    };

    await auth_tokens.insertOne(auth_tokens_doc);

    const base = APP_ORIGIN;
    const verifyUrl = new URL(VERIFY_URL, base);
    verifyUrl.searchParams.set("token", token);

    if (resend) {
      await resend.emails.send({
        from: EMAIL_FROM,
        html: `
        <p>Confirm your email to continue.</p>
        <p><a href="${verifyUrl.toString()}">Verify email</a></p>
        <p>This link expires at ${expiresAt.toISOString()}.</p>
      `,
        subject: "Confirm your email",
        to: email,
      });
    } else {
      console.log(
        "[DEV] Email disabled. Verification link:",
        verifyUrl.toString(),
      );
    }

    return NextResponse.json({ existingUser: false, status: "ok" });
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
