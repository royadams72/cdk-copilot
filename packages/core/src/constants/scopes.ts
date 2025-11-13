// lib/auth/scopes.ts
export const SCOPES = {
  USERS_PII_READ: "users:pii:read",
  USERS_PII_WRITE: "users:pii:write",
  USERS_CLINICAL_READ: "users:clinical:read",
  USERS_CLINICAL_WRITE: "users:clinical:write",

  FITPLANS_READ: "fitplans:read",
  FITPLANS_WRITE: "fitplans:write",

  LABS_READ: "labs:read",
  LABS_WRITE: "labs:write",
  MEDS_READ: "medications:read",
  MEDS_WRITE: "medications:write",
  MEASUREMENTS_READ: "measurements:read",
  MEASUREMENTS_WRITE: "measurements:write",
  CAREPLANS_READ: "careplans:read",
  CAREPLANS_WRITE: "careplans:write",

  CARETEAMS_READ: "careteams:read",
  CARETEAMS_WRITE: "careteams:write",
  FACILITIES_READ: "facilities:read",
  FACILITIES_WRITE: "facilities:write",
  ORGS_READ: "orgs:read",
  ORGS_WRITE: "orgs:write",

  LOGS_READ: "logs:read",
  ADMIN_USERS: "admin:users",
  ADMIN_DB: "admin:db",
  PATIENTS_READ: "patients.read",
  PATIENTS_FLAGS_WRITE: "patients.flags.write",

  AUTH_TOKENS_ISSUE: "auth_tokens.issue",
  // optional super-scope
  STAR: "*",
};

export const ROLES = {
  Patient: "patient",
  Clinician: "clinician",
  Dietitian: "dietitian",
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];
export type Role = "patient" | "clinician" | "dietitian" | "admin";

// Role → scopes (no strings!)
export const ROLE_SCOPES: Record<Role, readonly Scope[]> = {
  patient: [
    SCOPES.USERS_PII_READ,
    SCOPES.USERS_PII_WRITE,
    SCOPES.USERS_CLINICAL_READ,
    SCOPES.FITPLANS_READ,
    SCOPES.MEASUREMENTS_READ,
  ],
  clinician: [
    SCOPES.USERS_PII_READ,
    SCOPES.USERS_CLINICAL_READ,
    SCOPES.USERS_CLINICAL_WRITE,
    SCOPES.FITPLANS_READ,
    SCOPES.FITPLANS_WRITE,
    SCOPES.LABS_READ,
    SCOPES.MEDS_READ,
    SCOPES.CAREPLANS_READ,
    SCOPES.CAREPLANS_WRITE,
    SCOPES.MEASUREMENTS_READ,
  ],
  dietitian: [
    SCOPES.USERS_PII_READ,
    SCOPES.USERS_CLINICAL_READ,
    SCOPES.FITPLANS_READ,
    SCOPES.FITPLANS_WRITE,
    SCOPES.CAREPLANS_READ,
    SCOPES.CAREPLANS_WRITE,
    SCOPES.MEASUREMENTS_READ,
  ],
  admin: Object.values(SCOPES),
};

// tiny checker
export function hasScopes(
  has: readonly Scope[] | undefined,
  needs: Scope | Scope[]
) {
  if (!has?.length) return false;
  const set = new Set(has);
  if (set.has(SCOPES.STAR)) return true;
  const list = Array.isArray(needs) ? needs : [needs];
  return list.every((s) => set.has(s));
}
