import { z } from "zod";

import { dateAsISOString, objectIdHex, PrincipalId } from "./common";

export const PatientMembershipAction = z.enum([
  "extended",
  "suspended",
  "ended",
  "reactivated",
]);

export const PatientMembershipEvent = z.object({
  _id: objectIdHex.optional(),
  action: PatientMembershipAction,
  actorPrincipalId: PrincipalId,
  actorRole: z.string().min(1),
  assignmentId: z.string().min(1),
  careTeamId: z.string().min(1),
  createdAt: dateAsISOString,
  facilityId: z.string().min(1),
  nextEndsAt: dateAsISOString.nullable().optional(),
  nextStatus: z.enum(["pending", "active", "inactive", "ended"]),
  note: z.string().trim().min(1),
  orgId: z.string().min(1),
  patientId: objectIdHex,
  previousEndsAt: dateAsISOString.nullable().optional(),
  previousStatus: z.enum(["pending", "active", "inactive", "ended"]),
});

export type TPatientMembershipAction = z.infer<typeof PatientMembershipAction>;
export type TPatientMembershipEvent = z.infer<typeof PatientMembershipEvent>;
