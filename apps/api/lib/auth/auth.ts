// lib/auth.ts (server-only)
import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { hasScopes, Scope } from "@ckd/core/";

export type SessionUser = {
  authId: string;
  role: "patient" | "clinician" | "dietitian" | "admin";
  orgId: string;
  facilityIds?: string[];
  careTeamIds?: string[];
  patientId?: string;
  allowedPatientIds?: string[];
  scopes?: string[];
};

const isProd = process.env.NODE_ENV === "production";
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret";

async function verifyJWT(token: string) {
  const secret = new TextEncoder().encode(JWT_SECRET);
  const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
  return payload as Record<string, any>;
}

function getBearer(req: NextRequest) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

export async function requireUser(
  req: NextRequest,
  neededScopes: Scope | Scope[]
): Promise<SessionUser> {
  // Dev mocks
  const mockAuthId = req.headers.get("x-mock-auth-id");
  if (!isProd && mockAuthId) {
    const scopes = (req.headers.get("x-mock-scopes") || "")
      .split(",")
      .filter(Boolean);
    const role =
      (req.headers.get("x-mock-role") as SessionUser["role"]) || "admin";
    return {
      authId: mockAuthId,
      role,
      orgId: req.headers.get("x-mock-org-id") || "org_demo",
      scopes,
    };
  }
  const token = getBearer(req);
  if (!isProd && token.startsWith("mock-")) {
    return {
      authId: token.replace("mock-", "user_"),
      role: "admin",
      orgId: "org_demo",
      scopes: ["*"],
    };
  }

  if (!token) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  const claims = await verifyJWT(token);

  // Map your IdP claims → SessionUser
  const authId = (claims.sub as string) || (claims.user_id as string);
  if (!authId) throw Object.assign(new Error("Unauthorized"), { status: 401 });

  const db = await getDb();
  const ua = await db
    .collection("users_accounts")
    .findOne({ authId, isActive: true });
  if (!ua) throw Object.assign(new Error("Forbidden"), { status: 403 });

  const user = ua as unknown as SessionUser;

  // Scope check (supports "*" super-scope)
  if (neededScopes.length && !hasScopes(user.scopes, neededScopes)) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }

  return user;
}
