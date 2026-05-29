import { z } from "zod";

import {
  AssignmentId,
  dateAsISOString,
  objectIdHex,
  PrincipalId,
} from "./common";

export const PatientConsentType = z.enum([
  "signup_assignment",
  "care_team_added",
  "clinician_added",
]);

export const PatientConsentStatus = z.enum([
  "pending",
  "accepted",
  "declined",
  "superseded",
  "revoked",
]);

export const PatientConsentDecision = z.enum(["agree", "disagree"]);

export const PatientConsentDecisionSource = z.enum([
  "signup",
  "in_app",
  "push_open",
  "admin_reset",
]);

export const PatientConsentCopy = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

export const PatientConsentBase = z.object({
  _id: objectIdHex.optional(),
  patientId: objectIdHex,
  principalId: PrincipalId,
  assignmentId: AssignmentId,
  orgId: z.string().min(1),
  facilityId: z.string().min(1),
  careTeamId: z.string().min(1),
  clinicianPrincipalId: PrincipalId.optional(),
  type: PatientConsentType,
  status: PatientConsentStatus,
  decision: PatientConsentDecision.nullable().optional(),
  decisionSource: PatientConsentDecisionSource.nullable().optional(),
  requestedAt: dateAsISOString,
  decidedAt: dateAsISOString.nullable().optional(),
  copy: PatientConsentCopy,
  createdAt: dateAsISOString,
  updatedAt: dateAsISOString,
  createdBy: PrincipalId,
  updatedBy: PrincipalId,
});

export const PatientConsentCreate = PatientConsentBase.omit({
  _id: true,
});

export const PatientConsentDecisionRequest = z.object({
  decision: PatientConsentDecision,
  decisionSource: PatientConsentDecisionSource.optional(),
});

export type TPatientConsent = z.infer<typeof PatientConsentBase>;
export type TPatientConsentCreate = z.infer<typeof PatientConsentCreate>;
export type TPatientConsentDecisionRequest = z.infer<
  typeof PatientConsentDecisionRequest
>;
