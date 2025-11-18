import { z } from "zod";
import {
  dateAsISOString,
  EmailLower,
  objectIdHex,
  PrincipalId,
} from "./common";

export const UsersAccount_Base = z.object({
  orgId: z.string().min(1),
  role: z.string(),
  email: EmailLower,
  principalId: PrincipalId,
  scopes: z.array(z.string()).optional(),
  facilityIds: z.array(z.string()).optional(),
  careTeamIds: z.array(z.string()).optional(),
  allowedPatientIds: z.array(objectIdHex).optional(),
  isActive: z.boolean().default(true),
  createdAt: dateAsISOString.optional(),
  updatedAt: dateAsISOString,
  createdBy: PrincipalId,
  updatedBy: PrincipalId,
});

export const UsersAccountCreate = UsersAccount_Base.pick({
  email: true,
  principalId: true,
  isActive: true,
  createdBy: true,
  updatedBy: true,
});

export type TUsersAccountCreate = z.infer<typeof UsersAccountCreate>;
export type TUsersAccount = z.infer<typeof UsersAccount_Base>;
