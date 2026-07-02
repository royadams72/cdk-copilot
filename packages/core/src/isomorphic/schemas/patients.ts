// lib/schemas/patients.ts
import { z } from "zod";
import {
  AssignmentId,
  CKDStage,
  dateAsISOString,
  objectIdHex,
  PrincipalId,
} from "./common";

export const PatientSummary = z
  .object({
    lastContactAt: dateAsISOString.optional(),
    dietitianAssigned: z.boolean().optional(),
  })
  .loose(); // allow future summary keys

export const PatientAssignment = z.object({
  assignmentId: AssignmentId,
  orgId: z.string().min(1),
  facilityId: z.string().min(1),
  careTeamId: z.string().min(1),
  status: z.enum(["pending", "active", "inactive", "ended"]),
  consentStatus: z.enum(["pending", "accepted", "declined", "revoked"]),
  startsAt: dateAsISOString.nullable().optional(),
  endsAt: dateAsISOString.nullable().optional(),
  createdAt: dateAsISOString,
  updatedAt: dateAsISOString,
});

export const Patient_Base = z.object({
  _id: objectIdHex,
  principalId: PrincipalId.optional(),
  assignments: z.array(PatientAssignment).default([]),
  summary: PatientSummary.default({}),
  stage: CKDStage.optional(),
  flags: z.array(z.string()).default([]),
  createdAt: dateAsISOString,
  updatedAt: dateAsISOString,
});

// For your GET projection:
export const PatientListProjection = z.object({
  _id: objectIdHex, // or objectIdHex if you serialize first
  assignments: z.array(PatientAssignment).optional(),
  summary: PatientSummary,
  stage: CKDStage.optional(),
  flags: z.array(z.string()).optional(),
  updatedAt: dateAsISOString,
});

export type TPatientAssignment = z.infer<typeof PatientAssignment>;
export type TPatient_Base = z.infer<typeof Patient_Base>;
export type PatientListProjection = z.infer<typeof PatientListProjection>;
