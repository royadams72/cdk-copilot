import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { COLLECTIONS, hasScopes, Scope, SCOPES } from "@ckd/core/";

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

// --- Constants ---
const ROLE_SCOPES: Record<string, string[]> = {
  patient: [SCOPES.PATIENTS_READ, SCOPES.PATIENTS_FLAGS_WRITE], // minimal default
  clinician: [SCOPES.USERS_CLINICAL_READ],
  admin: [],
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

  // --- Dev mocks (mock bearer) ---
  const token = getBearer(req);

  // --- Real auth path ---
  if (!token) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  const claims = await verifyJWT(token);

  const credentialId = (claims.sub as string) || (claims.user_id as string);
  if (!credentialId)
    throw Object.assign(new Error("Unauthorized"), { status: 401 });

  const provider = getProviderFromReq(req);

  const link = await db.collection("auth_links").findOne({
    provider,
    credentialId,
    active: true,
  });

  if (!link) throw Object.assign(new Error("Forbidden"), { status: 403 });

  const principalId: string = link.principalId;
  const acct = await db.collection(COLLECTIONS.UsersAccounts).findOne(
    { principalId, isActive: true },
    {
      projection: {
        role: 1,
        orgId: 1,
        facilityIds: 1,
        careTeamIds: 1,
        scopes: 1,
        grants: 1,
        patientId: 1,
        allowedPatientIds: 1,
      },
    }
  );

  if (!acct) throw Object.assign(new Error("Forbidden"), { status: 403 });

  const roleScopes = ROLE_SCOPES[acct.role] ?? [];
  const grants = [...(acct.scopes ?? []), ...(acct.grants ?? [])];
  const scopes = Array.from(new Set([...roleScopes, ...grants]));

  const user: SessionUser = {
    authId: credentialId,
    provider,
    principalId: link.principalId,
    role: acct.role,
    orgId: acct.orgId,
    facilityIds: acct.facilityIds ?? [],
    careTeamIds: acct.careTeamIds ?? [],
    patientId: acct.patientId ? String(acct.patientId) : undefined,
    allowedPatientIds: acct.allowedPatientIds ?? [],
    scopes,
  };
  if (
    (neededScopes as string[]).length &&
    !hasScopes(user.scopes, neededScopes)
  ) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }

  // Neither staff nor patient found for this principal
  throw Object.assign(new Error("Forbidden"), { status: 403 });
}
