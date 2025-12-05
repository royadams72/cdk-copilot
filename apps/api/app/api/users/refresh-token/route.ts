import type { JWTPayload } from "jose";
import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";

import { COLLECTIONS } from "@ckd/core/server";
import { TAuthLink, TUsersAccount } from "@ckd/core";

import {
  ROLE_SCOPES,
  findPatientIdForPrincipal,
} from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { ok, bad } from "@/apps/api/lib/http/responses";

export const runtime = "nodejs";
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret";

export async function GET(req: NextRequest) {
  const requestId = makeRandomId();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return bad("Unauthorized", { requestId }, 401);
  }

  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    let claims: JWTPayload | undefined;

    try {
      const verified = await jwtVerify(token, secret, {
        algorithms: ["HS256"],
      });
      claims = verified.payload;
      console.log("claims1:::", claims);
    } catch (err: any) {
      if (err?.code === "ERR_JWT_EXPIRED" && err?.payload) {
        claims = err.payload as JWTPayload;
        console.log("claims2:::", claims);
      } else {
        console.error("jwtVerify failed during refresh", err);
        return bad("Unauthorized", { requestId }, 401);
      }
    }
    console.log("claims3:::", claims);

    const credentialId = claims?.sub;
    if (!credentialId || typeof credentialId !== "string") {
      return bad("Unauthorized", { requestId }, 401);
    }

    const db = await getDb();
    const authLink = await db
      .collection<TAuthLink>(COLLECTIONS.AuthLinks)
      .findOne(
        { credentialId, active: true },
        {
          projection: {
            principalId: 1,
            provider: 1,
          },
        }
      );

    if (!authLink?.principalId) {
      return bad("Unauthorized", { requestId }, 401);
    }

    const { principalId } = authLink;
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
        }
      );

    if (!account) {
      return bad("Unauthorized", { requestId }, 401);
    }

    const roleScopes = ROLE_SCOPES[account.role] ?? [];
    const grants = [...(account.scopes ?? []), ...(account.grants ?? [])];
    const scopes = Array.from(new Set([...roleScopes, ...grants]));

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

    await db
      .collection(COLLECTIONS.AuthLinks)
      .updateOne({ credentialId }, { $set: { lastRefreshAt: new Date() } });

    return ok({ requestId, jwt: nextJwt }, 200);
  } catch (err: any) {
    console.error("refresh-token error", err);
    const status = err?.status || 500;
    return bad(err?.message || "Server error", { requestId }, status);
  }
}
