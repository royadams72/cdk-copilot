// lib/schemas/usersAccounts.ts
import { z } from "zod";
import { dateAsISOString, objectIdHex, PrincipalId } from "./common";

export const Role = z.enum(["patient", "clinician", "dietitian", "admin"]);

export const SCOPES = [
  "patients.read",
  "patients.write",
  "patients.flags.write",
] as const;
export const Scope = z.enum(SCOPES);

export const UsersAccount_Base = z.object({
  orgId: z.string().min(1),
  role: Role,
  principalId: PrincipalId,
  scopes: z.array(Scope).default([]),
  facilityIds: z.array(z.string()).optional(),
  careTeamIds: z.array(z.string()).optional(),
  allowedPatientIds: z.array(objectIdHex).optional(),
  isActive: z.boolean().default(true),
  createdAt: dateAsISOString.optional(),
  updatedAt: dateAsISOString,
  createdBy: PrincipalId,
  updatedBy: PrincipalId,
});

export const UsersAccountCreate = UsersAccount_Base.omit({
  receivedAt: true,
  createdBy: true,
  updatedBy: true,
});

export type TUsersAccountCreate = z.infer<typeof UsersAccountCreate>;
export type TUsersAccount = z.infer<typeof UsersAccount_Base>;
export type TRole = z.infer<typeof Role>;
export type TScope = z.infer<typeof Scope>;
