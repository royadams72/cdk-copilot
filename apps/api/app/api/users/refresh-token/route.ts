import { NextRequest } from "next/server";

import { COLLECTIONS } from "@ckd/core/server";
import { TUsersAccount } from "@ckd/core";

import { COLLECTION_TYPE } from "@/apps/api/lib/auth/collectionType";
import { ROLE_SCOPES } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { ok, bad } from "@/apps/api/lib/http/responses";
import { issueSessionTokens } from "@/apps/api/lib/auth/sessionTokens";
import {
  AuthTokenDoc,
  parseToken,
  validateAuth,
} from "@/apps/api/lib/auth/auth_token";
import { Collection, ObjectId } from "mongodb";
import { enforceRateLimit, getClientIp } from "@/apps/api/lib/auth/rateLimit";
import { syncExpiredPatientMemberships } from "@/apps/api/lib/portal/patientMembershipExpiry";
import { summarizeAssignmentState } from "@/apps/api/lib/utils/patientAssignments";

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
    await enforceRateLimit([
      {
        bucket: "refresh_ip",
        key: getClientIp(req),
        limit: 120,
        windowMs: 15 * 60 * 1000,
      },
    ]);
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

    if (account.role === "patient") {
      const patientObjectId =
        tokenDoc.patientId instanceof ObjectId
          ? tokenDoc.patientId
          : new ObjectId(String(tokenDoc.patientId));
      await syncExpiredPatientMemberships({
        db,
        patientId: patientObjectId,
      });
      const patient = await db.collection(COLLECTIONS.Patients).findOne<{
        assignments?: Array<{
          endsAt?: Date | string | null;
          status?: string | null;
        }>;
      }>(
        {
          _id: patientObjectId,
        },
        { projection: { assignments: 1 } },
      );
      const assignmentState = summarizeAssignmentState(
        (patient?.assignments ?? []) as any,
      );
      if (!assignmentState.hasActiveAssignments) {
        console.warn("refresh-token: patient membership inactive", {
          patientId: String(tokenDoc.patientId),
          principalId,
        });
        return bad(
          "Your membership is no longer active.",
          { requestId, code: "membership_inactive" },
          403,
        );
      }
    }

    const session = await issueSessionTokens({
      authTokens,
      credentialId,
      email: tokenDoc.email ?? null,
      principalId,
      subjectId:
        tokenDoc.patientId instanceof ObjectId
          ? tokenDoc.patientId
          : new ObjectId(String(tokenDoc.patientId)),
      userAccount: account,
    });
    await authTokens.updateOne(
      { _id: tokenDoc._id },
      { $set: { rotatedAt: new Date(), replacedById: session.refreshTokenId } },
    );

    return ok(
      { requestId, jwt: session.jwt, refreshToken: session.refreshToken },
      200,
    );
  } catch (err: any) {
    if (err?.status === 429) {
      return bad("Too many requests", { requestId, code: "rate_limited" }, 429);
    }
    console.error("refresh-token error", err);
    const status = err?.status || 500;
    return bad(err?.message || "Server error", { requestId }, status);
  }
}
