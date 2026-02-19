import { z } from "zod";
import { objectIdHex, PrincipalId } from "./common";

// Helpers
// if not UUIDs in your app, relax to z.string().min(1)

export const LabSource = z.enum(["import", "integration", "manual"]);
export const LabStatus = z.enum([
  "final",
  "corrected",
  "preliminary",
  "cancelled",
]);
export const LabAbnormalFlag = z.enum(["", "L", "LL", "H", "HH", "A", "N"]);

export const RefRange = z
  .object({
    low: z.number().optional(),
    high: z.number().optional(),
    text: z.string().min(1).optional(),
  })
  .refine(
    (r) => !(r.low !== undefined && r.high !== undefined) || r.low <= r.high,
    { message: "refRange.low must be ≤ refRange.high" }
  );

export const LabLedger_Base = z.object({
  _id: objectIdHex, // Primary Key (PK)
  orgId: z.string().min(1),
  patientId: objectIdHex, // ref: patients
  code: z.string().min(1), // LOINC/SNOMED where possible
  name: z.string().min(1), // e.g. "eGFR"
  value: z.union([z.number(), z.string().min(1)]),
  unit: z.string().min(1).optional(), // e.g. mL/min/1.73m²
  refRange: RefRange.optional(),
  takenAt: z.date().nullable(),
  reportedAt: z.date().optional().nullable(),
  source: LabSource.default("import"),
  status: LabStatus.default("final"),
  abnormalFlag: LabAbnormalFlag.optional().default(""),
  note: z.string().min(1).optional(), // non-PII operational note
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: PrincipalId, // ref principalId
  updatedBy: PrincipalId, // ref principalId
});

export const LabCurrent_Base = z.object({
  _id: objectIdHex, // Primary Key (PK)
  orgId: z.string().min(1),
  patientId: objectIdHex, // ref: patients
  code: z.string().min(1),
  name: z.string().min(1),
  value: z.union([z.number(), z.string().min(1)]),
  unit: z.string().min(1).nullable().optional(),
  takenAt: z.date(),
  reportedAt: z.date().nullable().optional(),
  source: LabSource.default("import"),
  status: LabStatus.default("final"),
  abnormalFlag: LabAbnormalFlag.optional().default(""),
  refRange: RefRange.optional(),
  ledgerId: objectIdHex,
  prevLedgerId: objectIdHex.nullable().optional(),
  updatedReason: z.string().min(1).nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  createdBy: PrincipalId,
  updatedBy: PrincipalId,
});

// For creates: server usually sets _id/createdAt/updatedAt/createdBy/updatedBy
export const LabLedger_Create = LabLedger_Base.omit({
  _id: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
}).extend({
  source: LabSource.default("import"),
  status: LabStatus.default("final"),
});

// For updates: partial, but keep immutable IDs out of reach if you prefer
export const LabLedger_Update = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  value: z.union([z.number(), z.string().min(1)]).optional(),
  unit: z.string().min(1).optional(),
  refRange: RefRange.optional(),
  takenAt: z.date().optional(),
  reportedAt: z.date().optional(),
  source: LabSource.optional(),
  status: LabStatus.optional(),
  abnormalFlag: LabAbnormalFlag.optional(),
  note: z.string().min(1).optional(),
});

export const LabCurrent_Upsert = LabCurrent_Base.omit({
  _id: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
});

export const LabFormEntry = LabLedger_Base.omit({
  _id: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
  refRange: true,
  orgId: true,
  patientId: true,
}).extend({
  refRangeLow: z.string().optional(),
  refRangeHigh: z.string().optional(),
  refRangeText: z.string().optional(),
});

export const LabsSchema = z.object({
  labs: z.array(LabFormEntry).min(1, "Add at least one lab result"),
});

export type TLabsFormValues = z.infer<typeof LabsSchema>;
export type TLabLedger = z.infer<typeof LabLedger_Base>;
export type TLabCurrent = z.infer<typeof LabCurrent_Base>;

// Backward-compatible aliases while the app migrates to explicit ledger/current naming.
export const LabResult_Base = LabLedger_Base;
export const LabResult_Create = LabLedger_Create;
export const LabResult_Update = LabLedger_Update;
export type TLabResult = TLabLedger;
