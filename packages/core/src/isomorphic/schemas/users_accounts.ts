import { z } from "zod";
import {
  dateAsISOString,
  EmailLower,
  objectIdHex,
  PrincipalId,
} from "./common";

export const UsersAccount_Base = z.object({
  allowedPatientIds: z.array(objectIdHex).optional(),
  careTeamIds: z.array(z.string()).optional(),
  createdAt: z.coerce.date().optional(),
  createdBy: PrincipalId,
  email: EmailLower,
  facilityIds: z.array(z.string()).optional(),
  grants: z.array(z.string()).optional(),
  isActive: z.boolean().default(true),
  orgId: z.string().min(1),
  principalId: PrincipalId,
  role: z.string(),
  scopes: z.array(z.string()).optional(),
  updatedAt: z.coerce.date(),
  updatedBy: PrincipalId,
});

export const UsersAccountCreate = UsersAccount_Base.pick({
  createdBy: true,
  email: true,
  isActive: true,
  principalId: true,
  updatedBy: true,
});

export type TUsersAccountCreate = z.infer<typeof UsersAccountCreate>;
export type TUsersAccount = z.infer<typeof UsersAccount_Base>;
