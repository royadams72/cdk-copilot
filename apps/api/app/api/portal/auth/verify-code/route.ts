export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";

import { TUsersAccount } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

import { AuthTokenDoc } from "@/apps/api/lib/auth/auth_token";
import { getClientIp, enforceRateLimit } from "@/apps/api/lib/auth/rateLimit";
import { issueSessionTokens } from "@/apps/api/lib/auth/sessionTokens";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { validatePortalLoginCode } from "@/apps/api/lib/portal/loginCodes";

const Body = z.object({
  code: z.string().regex(/^\d{6}$/),
  email: z.email(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);

  if (!parsed.success) {
    return bad("Invalid email or code", { code: "invalid_payload" }, 400);
  }

  const email = parsed.data.email.trim().toLowerCase();
  const code = parsed.data.code.trim();

  try {
    await enforceRateLimit([
      {
        bucket: "portal_verify_ip",
        key: getClientIp(req),
        limit: 20,
        windowMs: 15 * 60 * 1000,
      },
      {
        bucket: "portal_verify_email",
        key: email,
        limit: 12,
        windowMs: 15 * 60 * 1000,
      },
    ]);

    const db = await getDb();
    const accounts = db.collection<TUsersAccount>(COLLECTIONS.UsersAccounts);
    const authLinks = db.collection(COLLECTIONS.AuthLinks);
    const authTokens = db.collection<AuthTokenDoc>(COLLECTIONS.AuthTokens);

    const account = await accounts.findOne(
      {
        email,
        isActive: true,
        role: { $in: ["clinician", "dietitian", "admin"] },
      },
      {
        collation: { locale: "en", strength: 2 },
        projection: {
          _id: 1,
          email: 1,
          grants: 1,
          orgId: 1,
          principalId: 1,
          role: 1,
          scopes: 1,
        },
      },
    );

    if (!account?.principalId || !(account._id instanceof ObjectId)) {
      return bad("Invalid or expired code", { code: "invalid_code" }, 400);
    }

    const codeValidation = await validatePortalLoginCode(authTokens, {
      code,
      email,
      principalId: account.principalId,
    });

    if (!codeValidation.ok) {
      return bad("Invalid or expired code", { code: codeValidation.reason }, 400);
    }

    const magicLink = await authLinks.findOne(
      {
        active: true,
        principalId: account.principalId,
        provider: "magic",
      },
      { projection: { credentialId: 1 } },
    );

    if (!magicLink?.credentialId) {
      return bad("Missing login credential", { code: "missing_credential" }, 400);
    }

    const session = await issueSessionTokens({
      authTokens,
      credentialId: magicLink.credentialId as string,
      email,
      principalId: account.principalId,
      subjectId: account._id,
      userAccount: account,
    });

    return ok({
      jwt: session.jwt,
      refreshToken: session.refreshToken,
    });
  } catch (error: any) {
    if (error?.status === 429) {
      return bad("Too many requests", { code: "rate_limited" }, 429);
    }
    return bad("Unable to verify code", { code: "verify_failed" }, 500);
  }
}
