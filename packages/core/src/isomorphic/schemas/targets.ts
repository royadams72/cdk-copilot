import { z } from "zod";
import { objectIdHex } from "./common";
import { TargetDefinition } from "./clinical_reference_rules";

export const TargetDomain = z.enum(["renal", "lifestyle"]);

export const TargetActor = z
  .object({
    actorType: z.enum(["user", "clinician", "system"]),
    displayName: z.string().nullable().optional(),
    principalId: z.string().min(1),
  })
  .strict();

export const TargetDerivedFrom = z
  .object({
    matchedAt: z.date().optional(),
    ruleId: z.string().min(1),
    version: z.number().int().min(1),
  })
  .strict();

export const TargetOverrideMeta = z
  .object({
    reason: z.string().nullable().optional(),
    setAt: z.date(),
    setBy: TargetActor,
  })
  .strict();

export const TargetMetricState = z
  .object({
    derivedFrom: TargetDerivedFrom.nullable().optional(),
    domain: TargetDomain,
    effective: TargetDefinition,
    metric: z.string().min(1),
    override: TargetDefinition.nullable().optional(),
    overrideMeta: TargetOverrideMeta.nullable().optional(),
    recommended: TargetDefinition,
    unit: z.string().min(1),
  })
  .strict()
  .superRefine((v, ctx) => {
    const effectiveSource = v.override ?? v.recommended;
    if (JSON.stringify(v.effective) !== JSON.stringify(effectiveSource)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "effective must equal override ?? recommended",
        path: ["effective"],
      });
    }
  });

export const TargetsCurrent_Base = z
  .object({
    _id: objectIdHex,
    engine: z
      .object({
        computedAt: z.date(),
        ruleset: z.literal("clinical_reference_rules"),
        runId: z.string().min(1),
      })
      .strict(),
    flags: z.array(z.string().min(1)).optional(),
    orgId: z.string().min(1),
    patientId: objectIdHex,
    targets: z.record(z.string().min(1), TargetMetricState),
    updatedAt: z.date(),
    updatedBy: TargetActor,
  })
  .strict();

export const TargetsCurrent_Upsert = TargetsCurrent_Base.omit({
  _id: true,
});

export const TargetEventType = z.enum([
  "system_recommended_target",
  "user_changed_target",
  "clinician_changed_target",
  "manual_target_removed",
  "system_recalculated_target",
  "admin_adjusted_target",
  "ledger_correction",
]);

export const TargetsLedger_Base = z
  .object({
    _id: objectIdHex,
    after: TargetDefinition,
    before: TargetDefinition.nullable(),
    correctionOf: objectIdHex.nullable().optional(),
    createdAt: z.date(),
    createdBy: TargetActor,
    derivedFrom: TargetDerivedFrom.nullable().optional(),
    domain: TargetDomain,
    eventType: TargetEventType,
    idemKey: z.string().min(1).nullable().optional(),
    metric: z.string().min(1),
    orgId: z.string().min(1).nullable().optional(),
    patientId: objectIdHex,
    reason: z.string().min(1).nullable().optional(),
    superseded: z.boolean().default(false),
  })
  .strict();

export const TargetsLedger_Create = TargetsLedger_Base.omit({
  _id: true,
});

export type TTargetsCurrent = z.infer<typeof TargetsCurrent_Base>;
export type TTargetsLedger = z.infer<typeof TargetsLedger_Base>;
