// lib/schemas/patients.ts
import { z } from "zod";
import { dateAsISOString, objectIdHex } from "./common";

export const CKDStage = z.enum(["1", "2", "3a", "3b", "4", "5", "5D", "Tx"]);

export const PatientSummary = z
  .object({
    lastContactAt: dateAsISOString.optional(),
    risk: z.enum(["green", "amber", "red"]).optional(),
    dietitianAssigned: z.boolean().optional(),
  })
  .loose(); // allow future summary keys

export const PatientDoc = z.object({
  patientId: objectIdHex,
  orgId: z.string().min(1).optional(),
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
  patientId: objectIdHex, // or objectIdHex if you serialize first
  summary: PatientSummary,
  stage: CKDStage.optional(),
  flags: z.array(z.string()).optional(),
  updatedAt: dateAsISOString,
});

export type TPatientDoc = z.infer<typeof PatientDoc>;
export type PatientListProjection = z.infer<typeof PatientListProjection>;
