// lib/auth.ts (server-only)
import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { hasScopes, Scope } from "@ckd/core/";

// ---- Types ----
export type AuthProvider =
  | "password"
  | "apple"
  | "google"
  | "nhs"
  | "azuread"
  | "magic";

export type SessionUser = {
  // Who authenticated THIS request (credential)
  authId: string; // credentialId from JWT sub
  provider: AuthProvider;

  // Who the person IS in your domain (stable principal)
  principalId: string; // acc_* or pat_* (or whatever you use)

  role: "patient" | "clinician" | "dietitian" | "admin";
  orgId?: string;
  facilityIds?: string[];
  careTeamIds?: string[];
  patientId?: string; // patients._id (string) when role === "patient"
  allowedPatientIds?: string[]; // staff optional
  scopes: string[]; // always present
};

const isProd = process.env.NODE_ENV === "production";
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret";

// ---- Helpers ----
function getBearer(req: NextRequest) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

function getProviderFromReq(req: NextRequest): AuthProvider {
  const raw = (req.headers.get("x-auth-provider") || "password").toLowerCase();
  const p = ["password", "apple", "google", "nhs", "azuread", "magic"] as const;
  return (p as readonly string[]).includes(raw)
    ? (raw as AuthProvider)
    : "password";
}

async function verifyJWT(token: string) {
  const secret = new TextEncoder().encode(JWT_SECRET);
  const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
  return payload as Record<string, any>; // must contain sub (credentialId)
}

// ---- requireUser ----
export async function requireUser(
  req: NextRequest,
  neededScopes: Scope | Scope[] = []
): Promise<SessionUser> {
  const db = await getDb();

  // --- Dev mocks (headers) ---
  const mockAuthId = req.headers.get("x-mock-auth-id");
  if (!isProd && mockAuthId) {
    const scopes = (req.headers.get("x-mock-scopes") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const role =
      (req.headers.get("x-mock-role") as SessionUser["role"]) || "admin";
    const orgId = req.headers.get("x-mock-org-id") || "org_demo";
    const provider = getProviderFromReq(req);

    // Try to infer patient vs staff for convenience
    // If patient, try to find a patients row by principalId OR authId if you've set them equal in mocks.
    const principalId =
      req.headers.get("x-mock-principal-id") ||
      (role === "patient" ? "pat_mock_001" : "acc_mock_001");

    // Build mock user (no DB lookups). Use "*" when not provided.
    const user: SessionUser = {
      authId: mockAuthId,
      provider,
      principalId,
      role,
      orgId,
      scopes: scopes.length ? scopes : ["*"],
      patientId:
        role === "patient"
          ? req.headers.get("x-mock-patient-id") || "656565656565656565656565"
          : undefined,
      facilityIds: (req.headers.get("x-mock-facility-ids") || "")
        .split(",")
        .filter(Boolean),
      careTeamIds: (req.headers.get("x-mock-care-team-ids") || "")
        .split(",")
        .filter(Boolean),
    };

    if (
      (neededScopes as string[]).length &&
      !hasScopes(user.scopes, neededScopes)
    ) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    return user;
  }

  // --- Dev mocks (mock bearer) ---
  const token = getBearer(req);
  if (!isProd && token.startsWith("mock-")) {
    const provider = getProviderFromReq(req);
    const user: SessionUser = {
      authId: token.replace("mock-", "cred_mock_"),
      provider,
      principalId: "acc_mock_001",
      role: "admin",
      orgId: "org_demo",
      scopes: ["*"],
    };
    if (
      (neededScopes as string[]).length &&
      !hasScopes(user.scopes, neededScopes)
    ) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    return user;
  }

  // --- Real auth path ---
  if (!token) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  const claims = await verifyJWT(token);

  const credentialId = (claims.sub as string) || (claims.user_id as string);
  if (!credentialId)
    throw Object.assign(new Error("Unauthorized"), { status: 401 });

  const provider = getProviderFromReq(req);

  // 1) Resolve credential -> principal via auth_links (must be active)
  const link = await db.collection("auth_links").findOne({
    provider,
    credentialId,
    active: true,
  });

  if (!link) throw Object.assign(new Error("Forbidden"), { status: 403 });

  const principalId: string = link.principalId;

  // 2) Try staff principal first (users_accounts)
  const staff = await db.collection("users_accounts").findOne({
    principalId,
    isActive: true,
  });

  if (staff) {
    const user: SessionUser = {
      authId: credentialId, // the credential used (for audit, sessions)
      provider,
      principalId, // stable person id
      role: staff.role,
      orgId: staff.orgId,
      facilityIds: staff.facilityIds ?? [],
      careTeamIds: staff.careTeamIds ?? [],
      scopes: staff.scopes ?? [],
      // no patientId on staff
    };

    if (
      (neededScopes as string[]).length &&
      !hasScopes(user.scopes, neededScopes)
    ) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    return user;
  }

  // 3) Else try patient principal (patients)
  const patient = await db.collection("patients").findOne({
    principalId,
    isActive: true,
  });

  if (patient) {
    const user: SessionUser = {
      authId: credentialId,
      provider,
      principalId,
      role: "patient",
      orgId: patient.orgId,
      patientId: String(patient._id), // canonical patient PK for joins
      scopes: patient.scopes ?? [],
    };

    if (
      (neededScopes as string[]).length &&
      !hasScopes(user.scopes, neededScopes)
    ) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    return user;
  }

  // Neither staff nor patient found for this principal
  throw Object.assign(new Error("Forbidden"), { status: 403 });
}
