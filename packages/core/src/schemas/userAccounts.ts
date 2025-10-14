// lib/schemas/usersAccounts.ts
import { z } from "zod";
import { dateAsISOString, objectIdHex } from "./common";

export const Role = z.enum(["patient", "clinician", "dietitian", "admin"]);

export const SCOPES = [
  "patients.read",
  "patients.write",
  "patients.flags.write",
] as const;
export const Scope = z.enum(SCOPES);

export const UsersAccount = z.object({
  authId: z.string().min(1),
  orgId: z.string().min(1),
  role: Role,
  scopes: z.array(Scope).default([]),
  facilityIds: z.array(z.string()).optional(),
  careTeamIds: z.array(z.string()).optional(),
  allowedPatientIds: z.array(objectIdHex).optional(),
  isActive: z.boolean().default(true),
  createdAt: dateAsISOString,
  updatedAt: dateAsISOString,
});

export type UsersAccount = z.infer<typeof UsersAccount>;
export type Role = z.infer<typeof Role>;
export type Scope = z.infer<typeof Scope>;
