import { z } from "zod";

import { dateAsISOString, objectIdHex, PrincipalId } from "./common";

export const PatientInviteStatus = z.enum([
  "pending_review",
  "invited",
  "activated",
  "expired",
  "revoked",
  "cancelled",
]);

export const PatientInviteSource = z.enum(["portal_batch", "portal_manual"]);

export const PatientInviteDurationMonths = z.enum(["3", "6", "12"]);

export const PatientInviteNhsNumber = z
  .string()
  .regex(/^\d{10}$/, "NHS number must be 10 digits");

export const PatientInviteBase = z.object({
  _id: objectIdHex.optional(),
  patientId: objectIdHex,
  principalId: PrincipalId,
  orgId: z.string().min(1),
  facilityId: z.string().min(1),
  careTeamId: z.string().min(1),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.email().transform((value) => value.toLowerCase()),
  dateOfBirth: dateAsISOString,
  nhsNumber: PatientInviteNhsNumber.optional(),
  durationMonths: PatientInviteDurationMonths,
  status: PatientInviteStatus,
  source: PatientInviteSource,
  batchId: z.string().min(1).optional(),
  activationCodeHash: z.string().min(20),
  activationCodeMasked: z.string().min(4),
  activationExpiresAt: dateAsISOString,
  invitedAt: dateAsISOString.nullable().optional(),
  activatedAt: dateAsISOString.nullable().optional(),
  reviewedAt: dateAsISOString.nullable().optional(),
  reviewedBy: PrincipalId.optional(),
  reviewNote: z.string().trim().min(1).optional(),
  createdAt: dateAsISOString,
  updatedAt: dateAsISOString,
  createdBy: PrincipalId,
  updatedBy: PrincipalId,
});

export const PatientInviteCreate = PatientInviteBase.omit({
  _id: true,
});

export type TPatientInvite = z.infer<typeof PatientInviteBase>;
export type TPatientInviteCreate = z.infer<typeof PatientInviteCreate>;
export type TPatientInviteStatus = z.infer<typeof PatientInviteStatus>;
export type TPatientInviteSource = z.infer<typeof PatientInviteSource>;
export type TPatientInviteDurationMonths = z.infer<
  typeof PatientInviteDurationMonths
>;
