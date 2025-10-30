import { z } from "zod";
import { objectIdHex, PrincipalId } from "./common";

/** PrincipalId strings from users_accounts or patients (e.g., acc_* / pat_*) */

export const CareTeamBase = z
  .object({
    orgId: z.string().min(1),
    name: z.string().min(1),
    memberUserIds: z.array(PrincipalId).optional(), // optional; require ≥1 if you want
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    createdBy: PrincipalId, // principalId string
    updatedBy: PrincipalId.optional(),
  })
  .loose(); // allow additional props

// Payloads for API
export const CareTeamCreate = CareTeamBase.partial({
  updatedAt: true,
  updatedBy: true,
}).strict();

export const CareTeamUpdate = z
  .object({
    name: z.string().min(1).optional(),
    memberUserIds: z.array(PrincipalId).optional(),
    updatedAt: z.coerce.date().optional(),
    updatedBy: PrincipalId.optional(),
  })
  .strict();

export const CareTeamDb = CareTeamBase.extend({
  _id: objectIdHex,
});

export type TCareTeamBase = z.infer<typeof CareTeamBase>;
export type TCareTeamCreate = z.infer<typeof CareTeamCreate>;
export type TCareTeamUpdate = z.infer<typeof CareTeamUpdate>;
export type TCareTeamDb = z.infer<typeof CareTeamDb>;
