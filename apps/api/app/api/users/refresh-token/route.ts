import { SignJWT } from "jose";
import { NextRequest } from "next/server";

import { COLLECTIONS } from "@ckd/core/server";
import { Role, TUsersAccount } from "@ckd/core";

import { COLLECTION_TYPE } from "@/apps/api/lib/auth/collectionType";
import { ROLE_SCOPES } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { ok, bad } from "@/apps/api/lib/http/responses";
import { getJwtSecretBytes } from "@/apps/api/lib/auth/jwt";
import {
  AuthTokenDoc,
  b64url,
  parseToken,
  setToken,
  validateAuth,
} from "@/apps/api/lib/auth/auth_token";
import { Collection, ObjectId } from "mongodb";

export const runtime = "nodejs";

async function revokeRefreshSessionFamily(
  authTokens: Collection<AuthTokenDoc>,
  tokenDoc: AuthTokenDoc,
  revokedAt: Date,
) {
  if (tokenDoc.sessionId) {
    await authTokens.updateMany(
      {
        type: COLLECTION_TYPE.Refresh,
        sessionId: tokenDoc.sessionId,
        revokedAt: null,
      },
      { $set: { revokedAt } },
    );
    return;
  }

  await authTokens.updateOne(
    { _id: tokenDoc._id, revokedAt: null },
    { $set: { revokedAt } },
  );
}

export async function POST(req: NextRequest) {
  const requestId = makeRandomId();
  const body = await req.json().catch(() => null);
  const refreshToken = (body?.refreshToken as string | undefined)?.trim();

  if (!refreshToken) {
    console.warn("refresh-token: missing refresh token");
    return bad("Missing refresh token", { requestId, code: "missing_token" }, 401);
  }

  try {
    const db = await getDb();
    const parsed = parseToken(refreshToken);
    if (!parsed) {
      console.warn("refresh-token: invalid format");
      return bad("Invalid refresh token format", { requestId, code: "invalid_format" }, 401);
    }

    const authTokens = db.collection<AuthTokenDoc>(COLLECTIONS.AuthTokens);
    const res = await validateAuth(authTokens, COLLECTION_TYPE.Refresh, parsed);
    if (!res.ok) {
      console.warn("refresh-token: validate failed", { reason: res.error });
      return bad(
        "Refresh token invalid or expired",
        { requestId, code: "refresh_invalid", reason: res.error },
        401,
      );
    }

    const tokenDoc = res.doc;
    if (tokenDoc.revokedAt) {
      console.warn("refresh-token: token revoked");
      return bad(
        "Refresh token revoked",
        { requestId, code: "refresh_revoked" },
        401,
      );
    }
    if (tokenDoc.rotatedAt) {
      const revokedAt = new Date();
      console.warn("refresh-token: rotated token replay detected", {
        principalId: tokenDoc.principalId,
        sessionId: tokenDoc.sessionId,
        tokenId: String(tokenDoc._id),
      });
      await revokeRefreshSessionFamily(authTokens, tokenDoc, revokedAt);
      return bad(
        "Refresh token replay detected",
        { requestId, code: "refresh_replayed" },
        401,
      );
    }

    const principalId = tokenDoc.principalId;
    const credentialId = tokenDoc.credentialId;
    if (!principalId || !credentialId) {
      console.warn("refresh-token: subject missing", {
        hasPrincipalId: !!principalId,
        hasCredentialId: !!credentialId,
      });
      return bad(
        "Refresh token missing principal or credential",
        { requestId, code: "refresh_subject_missing" },
        401,
      );
    }

    // Check if account is active
    const account = await db
      .collection<TUsersAccount>(COLLECTIONS.UsersAccounts)
      .findOne(
        { principalId, isActive: true },
        {
          projection: {
            role: 1,
            orgId: 1,
            scopes: 1,
            grants: 1,
            allowedPatientIds: 1,
          },
        },
      );

    if (!account) {
      console.warn("refresh-token: inactive account", { principalId });
      return bad("Account is inactive", { requestId, code: "account_inactive" }, 401);
    }

    const roleScopes = ROLE_SCOPES[account.role] ?? [];
    const grants = [...(account.scopes ?? []), ...(account.grants ?? [])];
    const scopes = Array.from(new Set([...roleScopes, ...grants]));

    const secret = getJwtSecretBytes();
    const nextJwt = await new SignJWT({
      sub: credentialId,
      principalId,
      orgId: account.orgId ?? null,
      scopes,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);

    const refreshTtlMs = 1000 * 60 * 60 * 24 * 30;
    const refreshExpiresAt = new Date(Date.now() + refreshTtlMs);
    const refreshTokenData = setToken();
    const newRefreshDoc: AuthTokenDoc = {
      _id: new ObjectId(),
      type: COLLECTION_TYPE.Refresh,
      id: b64url(refreshTokenData.id),
      secretHash: refreshTokenData.secretHash.toString("base64"),
      patientId: tokenDoc.patientId,
      principalId,
      credentialId,
      sessionId: tokenDoc.sessionId,
      orgId: tokenDoc.orgId ?? null,
      email: tokenDoc.email,
      scopes,
      role: account.role as Role,
      createdAt: new Date(),
      expiresAt: refreshExpiresAt,
      usedAt: null,
      revokedAt: null,
      rotatedAt: null,
      replacedById: null,
    };
    await authTokens.insertOne(newRefreshDoc);
    await authTokens.updateOne(
      { _id: tokenDoc._id },
      { $set: { rotatedAt: new Date(), replacedById: newRefreshDoc._id } },
    );

    return ok(
      { requestId, jwt: nextJwt, refreshToken: refreshTokenData.token },
      200,
    );
  } catch (err: any) {
    console.error("refresh-token error", err);
    const status = err?.status || 500;
    return bad(err?.message || "Server error", { requestId }, status);
  }
}
