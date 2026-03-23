import { z } from "zod";
import { objectIdHex } from "./common";

export const PatientGoalCode = z.enum([
  "weight_loss",
  "weight_maintenance",
  "weight_gain",
  "reduce_phosphorus",
  "reduce_potassium",
  "reduce_sodium",
  "increase_protein",
  "improve_energy",
  "better_meal_routine",
  "general_health",
]);

export const PatientGoalDomain = z.enum([
  "weight",
  "nutrition",
  "symptom",
  "lifestyle",
  "general",
]);

export const PatientGoalStatus = z.enum([
  "active",
  "inactive",
  "completed",
  "archived",
]);

export const PatientGoalSource = z.enum([
  "patient",
  "clinician",
  "dietitian",
  "admin",
  "system",
]);

export const PatientGoalActor = z
  .object({
    actorType: z.enum(["patient", "clinician", "dietitian", "admin", "system"]),
    displayName: z.string().nullable().optional(),
    principalId: z.string().min(1),
  })
  .strict();

export const PatientGoalState = z
  .object({
    code: PatientGoalCode,
    domain: PatientGoalDomain,
    effectiveCode: PatientGoalCode,
    label: z.string().min(1),
    lockedByCareTeam: z.boolean().default(false),
    notes: z.string().nullable().optional(),
    overrideAt: z.coerce.date().nullable().optional(),
    overrideBy: PatientGoalActor.nullable().optional(),
    overrideCode: PatientGoalCode.nullable().optional(),
    overrideReason: z.string().nullable().optional(),
    priority: z.number().int().min(1).max(20),
    selectedAt: z.coerce.date(),
    selectedBy: PatientGoalActor,
    source: PatientGoalSource,
    status: PatientGoalStatus.default("active"),
    updatedAt: z.coerce.date(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const expectedEffective = value.overrideCode ?? value.code;
    if (value.effectiveCode !== expectedEffective) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "effectiveCode must equal overrideCode ?? code",
        path: ["effectiveCode"],
      });
    }
  });

export const PatientGoalsCurrent = z
  .object({
    _id: objectIdHex.optional(),
    createdAt: z.coerce.date(),
    createdBy: PatientGoalActor,
    goals: z.array(PatientGoalState).default([]),
    orgId: z.string().min(1).nullable().optional(),
    patientId: objectIdHex,
    updatedAt: z.coerce.date(),
    updatedBy: PatientGoalActor,
  })
  .strict();

export const PatientGoalLedgerEventType = z.enum([
  "patient_selected",
  "patient_deselected",
  "care_team_added",
  "care_team_updated",
  "care_team_override_set",
  "care_team_override_cleared",
  "care_team_lock_set",
  "care_team_lock_cleared",
  "goal_completed",
  "goal_archived",
]);

export const PatientGoalsLedger = z
  .object({
    _id: objectIdHex.optional(),
    after: PatientGoalState.nullable(),
    before: PatientGoalState.nullable(),
    createdAt: z.coerce.date(),
    createdBy: PatientGoalActor,
    eventType: PatientGoalLedgerEventType,
    goalCode: PatientGoalCode,
    orgId: z.string().min(1).nullable().optional(),
    patientId: objectIdHex,
    reason: z.string().nullable().optional(),
  })
  .strict();

export const PatientGoalsUpdateRequest = z
  .object({
    selectedGoals: z.array(PatientGoalCode).default([]),
  })
  .strict();

export const PatientGoalsOverrideRequest = z
  .object({
    code: PatientGoalCode,
    lockedByCareTeam: z.boolean().default(true),
    notes: z.string().trim().max(1000).nullable().optional(),
    overrideCode: PatientGoalCode.nullable().optional(),
    patientId: objectIdHex,
    priority: z.number().int().min(1).max(20).optional(),
    reason: z.string().trim().max(1000).nullable().optional(),
    status: PatientGoalStatus.default("active"),
  })
  .strict();

export type TPatientGoalCode = z.infer<typeof PatientGoalCode>;
export type TPatientGoalDomain = z.infer<typeof PatientGoalDomain>;
export type TPatientGoalStatus = z.infer<typeof PatientGoalStatus>;
export type TPatientGoalSource = z.infer<typeof PatientGoalSource>;
export type TPatientGoalActor = z.infer<typeof PatientGoalActor>;
export type TPatientGoalState = z.infer<typeof PatientGoalState>;
export type TPatientGoalsCurrent = z.infer<typeof PatientGoalsCurrent>;
export type TPatientGoalsLedger = z.infer<typeof PatientGoalsLedger>;
export type TPatientGoalsUpdateRequest = z.infer<
  typeof PatientGoalsUpdateRequest
>;
export type TPatientGoalsOverrideRequest = z.infer<
  typeof PatientGoalsOverrideRequest
>;
