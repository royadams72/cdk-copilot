export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { Resend } from "resend";
import { ObjectId } from "mongodb";
import { z } from "zod";

import { Role, TUsersAccount } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

import { COLLECTION_TYPE } from "@/apps/api/lib/auth/collectionType";
import { AuthTokenDoc } from "@/apps/api/lib/auth/auth_token";
import { enforceRateLimit, getClientIp } from "@/apps/api/lib/auth/rateLimit";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  createPortalLoginCode,
  invalidatePortalLoginCodes,
} from "@/apps/api/lib/portal/loginCodes";

const Body = z.object({
  email: z.email(),
});

const RESEND_KEY = process.env.RESEND_API_KEY || "";
const resend = RESEND_KEY ? new Resend(RESEND_KEY) : null;
const EMAIL_FROM = process.env.EMAIL_FROM || null;
const IS_LOCAL_DEV =
  process.env.APP_ORIGIN?.includes("localhost") ||
  process.env.NODE_ENV !== "production";

function serializeError(error: unknown) {
  if (!error || typeof error !== "object") {
    return { message: String(error) };
  }

  const value = error as Record<string, unknown>;

  return {
    code: typeof value.code === "string" ? value.code : null,
    message: typeof value.message === "string" ? value.message : String(error),
    name: typeof value.name === "string" ? value.name : null,
    response:
      value.response && typeof value.response === "object"
        ? value.response
        : null,
    statusCode: typeof value.statusCode === "number" ? value.statusCode : null,
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);

  if (!parsed.success) {
    return bad("Invalid email address", { code: "invalid_email" }, 400);
  }

  const email = parsed.data.email.trim().toLowerCase();

  try {
    await enforceRateLimit([
      {
        bucket: "portal_login_ip",
        key: getClientIp(req),
        limit: 20,
        windowMs: 15 * 60 * 1000,
      },
      {
        bucket: "portal_login_email",
        key: email,
        limit: 8,
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
          orgId: 1,
          principalId: 1,
          role: 1,
          scopes: 1,
        },
      },
    );

    if (!account?.principalId) {
      console.log("Portal login email accepted by Resend");
      return ok({
        message: "If the account exists, a login code has been sent.",
      });
    }

    const existingMagicLink = await authLinks.findOne(
      {
        active: true,
        principalId: account.principalId,
        provider: "magic",
      },
      { projection: { credentialId: 1 } },
    );

    const credentialId =
      (existingMagicLink?.credentialId as string | undefined) ??
      `cred_${new ObjectId().toHexString()}`;

    if (!existingMagicLink) {
      await authLinks.insertOne({
        active: true,
        createdAt: new Date(),
        credentialId,
        email,
        principalId: account.principalId,
        provider: "magic",
      });
    }

    const now = new Date();
    await invalidatePortalLoginCodes(
      authTokens,
      email,
      account.principalId,
      now,
    );

    const loginCode = createPortalLoginCode();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 10);

    await authTokens.insertOne({
      id: loginCode.id,
      _id: new ObjectId(),
      type: COLLECTION_TYPE.PortalLoginCode,
      createdAt: now,
      credentialId,
      email,
      expiresAt,
      orgId: account.orgId ?? null,
      patientId: account._id instanceof ObjectId ? account._id : new ObjectId(),
      principalId: account.principalId,
      role: account.role as Role,
      scopes: account.scopes ?? [],
      secretHash: loginCode.secretHash,
      usedAt: null,
    });

    let devCode: string | undefined;

    if (resend && EMAIL_FROM) {
      try {
        const resendResult = await resend.emails.send({
          from: EMAIL_FROM,
          html: `
            <p>Your CKD Copilot portal login code is:</p>
            <p style="font-size:28px;font-weight:700;letter-spacing:0.12em;">${loginCode.code}</p>
            <p>This code expires at ${expiresAt.toISOString()}.</p>
          `,
          subject: "Your CKD Copilot portal login code",
          to: email,
        });

        if (IS_LOCAL_DEV) {
          devCode = loginCode.code;
          console.log("[DEV] Portal login email accepted by Resend", {
            email,
            resendId: resendResult.data?.id ?? null,
          });
        }
      } catch (error) {
        console.error("portal request-code: resend send failed", {
          email,
          emailFrom: EMAIL_FROM,
          error: serializeError(error),
          isLocalDev: IS_LOCAL_DEV,
          resendConfigured: Boolean(resend),
          resendKeyPrefix: RESEND_KEY ? RESEND_KEY.slice(0, 8) : null,
        });
        if (!IS_LOCAL_DEV) {
          throw error;
        }
        console.warn(
          "portal request-code: resend failed, falling back to dev code",
          error,
        );
        devCode = loginCode.code;
      }
    } else {
      console.log("portal request-code: resend disabled or sender missing", {
        email,
        emailFrom: EMAIL_FROM,
        isLocalDev: IS_LOCAL_DEV,
        resendConfigured: Boolean(resend),
        resendKeyPresent: Boolean(RESEND_KEY),
      });
      devCode = loginCode.code;
    }

    if (devCode) {
      console.log("[DEV] Portal login code for", email, "=", devCode);
    }

    return ok({
      devCode,
      message: "If the account exists, a login code has been sent.",
    });
  } catch (error: any) {
    if (error?.status === 429) {
      return bad("Too many requests", { code: "rate_limited" }, 429);
    }
    console.error("portal request-code failed", error);
    return bad("Unable to request login code", { code: "request_failed" }, 500);
  }
}
