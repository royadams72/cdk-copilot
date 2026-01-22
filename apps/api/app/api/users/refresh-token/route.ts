import { SignJWT } from "jose";
import { NextRequest } from "next/server";

import { COLLECTIONS } from "@ckd/core/server";
import { Role, TUsersAccount } from "@ckd/core";

import { ROLE_SCOPES } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { ok, bad } from "@/apps/api/lib/http/responses";
import {
  AuthTokenDoc,
  b64url,
  parseToken,
  setToken,
  validateAuth,
} from "@/apps/api/lib/auth/auth_token";
import { COLLECTION_TYPE } from "@/apps/api/app/api/patients/signup-init/route";
import { ObjectId } from "mongodb";

export const runtime = "nodejs";
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret";

export async function POST(req: NextRequest) {
  const requestId = makeRandomId();
  const body = await req.json().catch(() => null);
  const refreshToken = body?.refreshToken as string | undefined;

  if (!refreshToken) {
    return bad("Unauthorized1", { requestId }, 401);
  }

  try {
    const db = await getDb();
    const parsed = parseToken(refreshToken);
    if (!parsed) return bad("Unauthorized2", { requestId }, 401);

    const authTokens = db.collection<AuthTokenDoc>(COLLECTIONS.AuthTokens);
    const res = await validateAuth(authTokens, COLLECTION_TYPE.Refresh, parsed);
    if (!res.ok) return bad("Unauthorized3", { requestId }, 401);

    const tokenDoc = res.doc;
    if (tokenDoc.revokedAt || tokenDoc.rotatedAt) {
      return bad("Unauthorized4", { requestId }, 401);
    }

    const principalId = tokenDoc.principalId;
    const credentialId = tokenDoc.credentialId;
    if (!principalId || !credentialId) {
      return bad("Unauthorized5", { requestId }, 401);
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
      return bad("Unauthorized6", { requestId }, 401);
    }

    const roleScopes = ROLE_SCOPES[account.role] ?? [];
    const grants = [...(account.scopes ?? []), ...(account.grants ?? [])];
    const scopes = Array.from(new Set([...roleScopes, ...grants]));

    const secret = new TextEncoder().encode(JWT_SECRET);
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
