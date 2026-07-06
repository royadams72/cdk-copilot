import { z } from "zod";

import { PatientMembershipAction } from "../../isomorphic/schemas/patient_membership_events";

export const PatientMembershipStatus = z.enum([
  "pending",
  "active",
  "inactive",
  "ended",
]);

export type TPatientMembershipStatus = z.infer<typeof PatientMembershipStatus>;

export const PatientMembershipEventDocSchema = z.object({
  _id: z.any().optional(),
  action: PatientMembershipAction,
  actorPrincipalId: z.string().min(1),
  actorRole: z.string().min(1),
  assignmentId: z.string().min(1),
  careTeamId: z.string().min(1),
  createdAt: z.date(),
  facilityId: z.string().min(1),
  nextEndsAt: z.date().nullable().optional(),
  nextStatus: PatientMembershipStatus,
  note: z.string().trim().min(1),
  orgId: z.string().min(1),
  patientId: z.any(),
  previousEndsAt: z.date().nullable().optional(),
  previousStatus: PatientMembershipStatus,
});

export type TPatientMembershipEventDoc = z.infer<
  typeof PatientMembershipEventDocSchema
>;
