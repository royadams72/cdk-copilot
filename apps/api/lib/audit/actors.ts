import type { Role } from "@ckd/core";

export type AuditActorType = Role | "system";
export type TargetActorType = "user" | "clinician" | "system";

/** Maps an authenticated role to the shared clinical audit vocabulary. */
export function actorTypeFromRole(role: Role): Role {
  return role;
}

/**
 * Targets retain their legacy actor vocabulary: patients are `user` and every
 * authenticated staff role is `clinician`.
 */
export function targetActorTypeFromRole(
  role: Role,
): Exclude<TargetActorType, "system"> {
  return role === "patient" ? "user" : "clinician";
}
