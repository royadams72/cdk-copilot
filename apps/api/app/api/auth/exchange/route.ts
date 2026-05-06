import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";

import { COLLECTION_TYPE } from "@/apps/api/lib/auth/collectionType";
import { getDb } from "@/apps/api/lib/db/mongodb";

import { COLLECTIONS } from "@ckd/core/server";
import {
  AuthTokenDoc,
  b64url,
  consumeAuth,
  parseToken,
  setToken,
  validateAuth,
} from "@/apps/api/lib/auth/auth_token";
import { ObjectId } from "mongodb";
import { randomBytes } from "crypto";
import { updateScopes } from "@/apps/api/lib/utils/updateScopes";
import { requireUser, SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getJwtSecretBytes } from "@/apps/api/lib/auth/jwt";
import { DEFAULT_SCOPES, ONBOARDING_STEPS, SCOPES } from "@ckd/core";

function resolveOnboardingRoute(
  onboardingCompleted?: boolean,
  onboardingSteps?: string[],
) {
  if (onboardingCompleted) return null;
  if (onboardingSteps?.includes(ONBOARDING_STEPS.Pii)) {
    return "/(auth)/onboarding/clinical-form";
  }
  return "/(auth)/onboarding/pii-form";
}

async function revokeActiveRefreshTokensForCredential(
  authTokens: import("mongodb").Collection<AuthTokenDoc>,
  args: {
    credentialId: string;
    principalId: string;
    revokedAt: Date;
  },
) {
  await authTokens.updateMany(
    {
      type: COLLECTION_TYPE.Refresh,
      credentialId: args.credentialId,
      principalId: args.principalId,
      revokedAt: null,
      rotatedAt: null,
    },
    {
      $set: {
        revokedAt: args.revokedAt,
      },
    },
  );
}

export async function POST(req: NextRequest) {
  try {
    const user: SessionUser = await requireUser(req, DEFAULT_SCOPES, {
      allowBootstrap: true,
    });

    const db = await getDb();
    const { token } = await req.json().catch(() => ({}));

    const parsed = parseToken(token);

    if (!token || !parsed)
      return NextResponse.json({ error: "missing token" }, { status: 400 });

    const auth_tokens = db.collection<AuthTokenDoc>(COLLECTIONS.AuthTokens);

    const res = await validateAuth(
      auth_tokens,
      COLLECTION_TYPE.OauthCode,
      parsed,
    );

    if (!res.ok)
      return NextResponse.json(
        { error: res.error, ok: false },
        { status: 400 },
      );

    const patients = db.collection(COLLECTIONS.Patients);
    const patient = await patients.findOne<{ _id: ObjectId }>(
      {
        _id: res.doc.patientId,
      },
      { projection: { _id: 1 } },
    );

    if (!patient)
      return NextResponse.json(
        { error: "There is no patient record", ok: false },
        { status: 400 },
      );

    const consumed = await consumeAuth(auth_tokens, res.doc._id);
    if (!consumed.ok)
      return NextResponse.json(
        { error: consumed.error, ok: false },
        { status: 400 },
      );

    const auth_links = db.collection(COLLECTIONS.AuthLinks);
    const usersPii = db.collection(COLLECTIONS.UsersPII);
    const provider = "password";
    const existingAuthLink = await auth_links.findOne(
      { active: true, email: res.doc.email, provider },
      { projection: { credentialId: 1, principalId: 1 } },
    );
    const credentialId =
      existingAuthLink?.credentialId ??
      `cred_${randomBytes(12).toString("hex")}`;

    if (!existingAuthLink) {
      await auth_links.insertOne({
        active: true,
        createdAt: new Date(),
        credentialId,
        email: res.doc.email,
        principalId: String(res.doc.principalId),
        provider,
      });
    } else if (existingAuthLink.principalId !== String(res.doc.principalId)) {
      await auth_links.updateOne(
        { active: true, credentialId: existingAuthLink.credentialId, provider },
        { $set: { principalId: String(res.doc.principalId) } },
      );
    }

    const puser = { ...user, principalId: String(res.doc.principalId) };

    const scopes = await updateScopes(puser, [
      SCOPES.USERS_PII_READ,
      SCOPES.USERS_PII_WRITE,
    ]);

    const secret = getJwtSecretBytes();
    const jwt = await new SignJWT({
      orgId: res.doc.orgId,
      principalId: res.doc.principalId ?? null,
      scopes,
      sub: credentialId,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);

    const sessionId = `sess_${randomBytes(12).toString("hex")}`;
    const refreshTtlMs = 1000 * 60 * 60 * 24 * 30;
    const refreshExpiresAt = new Date(Date.now() + refreshTtlMs);
    const refreshToken = setToken();
    const refreshIssuedAt = new Date();

    await revokeActiveRefreshTokensForCredential(auth_tokens, {
      credentialId,
      principalId: String(res.doc.principalId),
      revokedAt: refreshIssuedAt,
    });

    const refreshDoc: AuthTokenDoc = {
      id: b64url(refreshToken.id),
      _id: new ObjectId(),
      type: COLLECTION_TYPE.Refresh,
      createdAt: refreshIssuedAt,
      credentialId,
      email: res.doc.email,
      expiresAt: refreshExpiresAt,
      orgId: res.doc.orgId ?? null,
      patientId: res.doc.patientId as ObjectId,
      principalId: String(res.doc.principalId),
      replacedById: null,
      revokedAt: null,
      role: res.doc.role,
      rotatedAt: null,
      scopes,
      secretHash: refreshToken.secretHash.toString("base64"),
      sessionId,
      usedAt: null,
    };
    await auth_tokens.insertOne(refreshDoc);
    const pii = await usersPii.findOne(
      { email: res.doc.email ?? "" },
      {
        collation: { locale: "en", strength: 2 },
        projection: { onboardingCompleted: 1, onboardingSteps: 1 },
      },
    );
    return NextResponse.json({
      jwt,
      onboardingCompleted: !!pii?.onboardingCompleted,
      onboardingSteps: pii?.onboardingSteps ?? [],
      nextOnboardingRoute: resolveOnboardingRoute(
        pii?.onboardingCompleted,
        pii?.onboardingSteps,
      ),
      refreshToken: refreshToken.token,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { e, error: "Error in exchange" },
      { status: 400 },
    );
  }
}
