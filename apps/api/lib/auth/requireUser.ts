// lib/auth.ts
import { getDb } from "@/apps/api/lib/db/mongodb";

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

export async function requireUser(
  req: Request,
  neededScopes: string[] = []
): Promise<SessionUser> {
  // parse JWT / session header (implementation-specific)
  const authId = /* decode your token */ "";
  if (!authId) throw new Error("Unauthorized");

  const db = await getDb();
  const ua = await db
    .collection("users_accounts")
    .findOne({ authId, isActive: true });
  if (!ua) throw new Error("Forbidden");

  const user = ua as unknown as SessionUser;

  // scope check
  if (neededScopes.length) {
    const have = new Set(user.scopes ?? []);
    const ok = neededScopes.every((s) => have.has(s));
    if (!ok) throw new Error("Forbidden");
  }
  return user;
}
