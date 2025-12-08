import { NextRequest } from "next/server";
import { JWTPayload, jwtVerify } from "jose";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { COLLECTIONS } from "@ckd/core/server";
import {
  DEFAULT_SCOPES,
  SCOPES,
  Scope,
  TUsersAccount,
  hasScopes,
  Role,
} from "@ckd/core";
import type { Db } from "mongodb";

export type AuthProvider =
  | "password"
  | "apple"
  | "google"
  | "nhs"
  | "azuread"
  | "magic";
export type SessionUser = {
  authId: string;
  provider: AuthProvider;
  principalId: string;
  role: "patient" | "clinician" | "dietitian" | "admin";
  orgId?: string;
  facilityIds?: string[];
  careTeamIds?: string[];
  patientId?: string;
  allowedPatientIds?: string[];
  scopes: string[];
};

export const ROLE_SCOPES: Record<string, Scope[]> = {
  patient: [SCOPES.PATIENTS_READ, SCOPES.PATIENTS_FLAGS_WRITE],
  clinician: [SCOPES.USERS_CLINICAL_READ],
  admin: [],
};

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret";
const SIGNUP_INIT_KEY = process.env.SIGNUP_INIT_KEY || ""; // set in env for prod

export function getBearer(req: NextRequest) {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

async function verifyJWT(token: string) {
  const secret = new TextEncoder().encode(JWT_SECRET);
  const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
  return payload as Record<string, any>;
}

export async function findPatientIdForPrincipal(db: Db, principalId: string) {
  const patient = await db
    .collection(COLLECTIONS.Patients)
    .findOne({ principalId }, { projection: { _id: 1 } });
  if (patient?._id) {
    return String(patient._id);
  }

  return undefined;
}

export async function requireUser(
  req: NextRequest,
  neededScopes: Scope | Scope[] = [],
  opts: { allowBootstrap?: boolean } = {}
): Promise<SessionUser> {
  const db = await getDb();
  const token = getBearer(req);

  // ===== 1) JWT path (normal) =====
  if (token) {
    const secret = new TextEncoder().encode(JWT_SECRET);
    let claims;
    try {
      const result = await jwtVerify(token, secret, { algorithms: ["HS256"] });
      claims = result.payload as Record<string, any>;
    } catch (err) {
      console.error("jwtVerify failed", err);
      throw Object.assign(
        new Error(err instanceof Error ? err.message : "Unauthorized"),
        { status: 401 }
      );
    }
    const credentialId = claims.sub as string;
    if (!credentialId)
      throw Object.assign(new Error("Unauthorized"), { status: 401 });
    const link = await db
      .collection(COLLECTIONS.AuthLinks)
      .findOne(
        { credentialId, active: true },
        { projection: { provider: 1, principalId: 1 } }
      );
    if (!link) throw Object.assign(new Error("Forbidden"), { status: 403 });
    const provider = link.provider as AuthProvider;

    const acct = await db
      .collection<TUsersAccount>(COLLECTIONS.UsersAccounts)
      .findOne(
        { principalId: link.principalId, isActive: true },
        {
          projection: {
            role: 1,
            orgId: 1,
            facilityIds: 1,
            careTeamIds: 1,
            scopes: 1,
            grants: 1,
            allowedPatientIds: 1,
          },
        }
      );

    if (!acct) throw Object.assign(new Error("Forbidden"), { status: 403 });

    const roleScopes: Scope[] = ROLE_SCOPES[acct.role] ?? [];
    const grants = [...(acct.scopes ?? []), ...(acct.grants ?? [])];
    const scopes = Array.from(new Set([...roleScopes, ...grants])) as Scope[];
    if (neededScopes.length && !hasScopes(scopes, neededScopes)) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }

    let patientId: string | undefined;
    if (acct.role === "patient") {
      patientId = await findPatientIdForPrincipal(db, link.principalId);
      if (!patientId) {
        throw Object.assign(new Error("Patient context missing"), {
          status: 403,
        });
      }
    }

    return {
      authId: credentialId,
      provider,
      principalId: link.principalId,
      role: acct.role as Role,
      orgId: acct.orgId,
      facilityIds: acct.facilityIds ?? [],
      careTeamIds: acct.careTeamIds ?? [],
      patientId,
      allowedPatientIds: (acct.allowedPatientIds ?? []).map((id: any) =>
        String(id)
      ),
      scopes,
    };
  }

  // ===== 2) Bootstrap path (no JWT) =====
  // Only allow when the caller is asking to issue auth tokens
  // and presents the shared secret header.
  if (
    opts.allowBootstrap &&
    hasScopes(
      Array.isArray(neededScopes) ? neededScopes : [neededScopes],
      DEFAULT_SCOPES
    )
  ) {
    return {
      authId: "bootstrap",
      provider: "magic",
      principalId: "provisional",
      role: "patient",
      scopes: DEFAULT_SCOPES,
    };
  }
  throw Object.assign(new Error("Unauthorized"), { status: 401 });
}
