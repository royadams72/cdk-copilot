import { z } from "zod";
import { CKDStage, objectIdHex } from "./common";

export const ClinicalReferenceRuleStatus = z.enum([
  "active",
  "deprecated",
  "disabled",
]);

export const ClinicalReferenceRuleKind = z.enum([
  "lab_range",
  "clinical_target",
  "health_target",
]);

export const RuleSex = z.enum(["male", "female", "any"]);
export const RuleDialysis = z.enum(["none", "hemodialysis", "peritoneal", "any"]);

export const AppliesWhen = z
  .object({
    ageMax: z.number().int().min(0).max(150).optional(),
    ageMin: z.number().int().min(0).max(150).optional(),
    ckdStage: z.union([CKDStage, z.literal("any")]).optional(),
    diabetes: z.boolean().nullable().optional(),
    dialysis: RuleDialysis.optional(),
    labConstraints: z.record(z.string(), z.unknown()).optional(),
    medConstraints: z.record(z.string(), z.unknown()).optional(),
    pregnancy: z.boolean().nullable().optional(),
    sex: RuleSex.optional(),
  })
  .strict();

export const TargetDefinition = z
  .object({
    basis: z.enum(["perDay", "perKgPerDay"]).nullable().optional(),
    high: z.number().finite().nullable().optional(),
    low: z.number().finite().nullable().optional(),
    type: z.enum(["range", "max", "min", "exact"]),
    value: z.number().finite().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === "range") {
      if (typeof v.low !== "number" && typeof v.high !== "number") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "range target requires low or high",
          path: ["low"],
        });
      }
      if (typeof v.low === "number" && typeof v.high === "number" && v.low > v.high) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "target low must be <= high",
          path: ["low"],
        });
      }
    } else if (typeof v.value !== "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "target value is required for non-range target types",
        path: ["value"],
      });
    }
  });

export const LabRangeDefinition = z
  .object({
    criticalHigh: z.number().finite().nullable().optional(),
    criticalLow: z.number().finite().nullable().optional(),
    lower: z.number().finite().nullable().optional(),
    upper: z.number().finite().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (typeof v.lower === "number" && typeof v.upper === "number" && v.lower > v.upper) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "range lower must be <= upper",
        path: ["lower"],
      });
    }
  });

export const RulePayload = z
  .object({
    range: LabRangeDefinition.optional(),
    target: TargetDefinition.optional(),
  })
  .strict();

export const RuleSource = z
  .object({
    note: z.string().nullable().optional(),
    publisher: z.string().min(1),
    title: z.string().min(1),
    url: z.string().url().nullable().optional(),
    year: z.number().int().min(1900).max(2100),
  })
  .strict();

export const ClinicalReferenceRule_Base = z
  .object({
    _id: objectIdHex,
    appliesWhen: AppliesWhen.default({}),
    code: z.string().min(1),
    createdAt: z.date(),
    kind: ClinicalReferenceRuleKind,
    label: z.string().min(1).optional(),
    orgId: z.string().min(1).nullable().optional(),
    priority: z.number().int().min(0).max(99),
    rule: RulePayload,
    ruleId: z.string().min(1),
    source: RuleSource,
    status: ClinicalReferenceRuleStatus.default("active"),
    unit: z.string().min(1),
    updatedAt: z.date(),
    version: z.number().int().min(1),
  })
  .superRefine((doc, ctx) => {
    if (doc.kind === "lab_range" && !doc.rule.range) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "lab_range rules require rule.range",
        path: ["rule", "range"],
      });
    }
    if (doc.kind !== "lab_range" && !doc.rule.target) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "target rules require rule.target",
        path: ["rule", "target"],
      });
    }
  });

export const ClinicalReferenceRule_Create = ClinicalReferenceRule_Base.omit({
  _id: true,
  createdAt: true,
  updatedAt: true,
});

export const ClinicalReferenceRule_Update = ClinicalReferenceRule_Base.partial().omit({
  _id: true,
  createdAt: true,
  ruleId: true,
  version: true,
});

export type TClinicalReferenceRule = z.infer<typeof ClinicalReferenceRule_Base>;
