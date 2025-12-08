// lib/schemas/patients.ts
import { z } from "zod";
import { dateAsISOString, objectIdHex, PrincipalId, CKDStage } from "./common";

export const PatientSummary = z
  .object({
    lastContactAt: dateAsISOString.optional(),
    risk: z.enum(["green", "amber", "red"]).optional(),
    dietitianAssigned: z.boolean().optional(),
  })
  .loose(); // allow future summary keys

export const Patient_Base = z.object({
  _id: objectIdHex,
  orgId: z.string().min(1).optional(),
  principalId: PrincipalId.optional(),
  facilityId: z.string().min(1).optional(),
  careTeamId: z.string().min(1).optional(),
  summary: PatientSummary.default({}),
  stage: CKDStage.optional(),
  flags: z.array(z.string()).default([]),
  createdAt: dateAsISOString,
  updatedAt: dateAsISOString,
});

// For your GET projection:
export const PatientListProjection = z.object({
  _id: objectIdHex, // or objectIdHex if you serialize first
  summary: PatientSummary,
  stage: CKDStage.optional(),
  flags: z.array(z.string()).optional(),
  updatedAt: dateAsISOString,
});

export type TPatient_Base = z.infer<typeof Patient_Base>;
export type PatientListProjection = z.infer<typeof PatientListProjection>;
