import { z } from "zod";
import { ObjectIdString, PrincipalId } from "./common";

export const DialysisStatus = z.enum([
  "none",
  "hemodialysis",
  "peritoneal",
  "post-transplant",
]);
export const ACR = z.enum(["A1", "A2", "A3"]); // Albumin-to-Creatinine Ratio category

const CKD_STAGE_VALUES = ["1", "2", "3a", "3b", "4", "5"] as const;
export const CKDStage = z.enum(CKD_STAGE_VALUES);

const Dx = z.object({ code: z.string().optional(), label: z.string().min(1) });
const Med = z.object({
  name: z.string().min(1),
  dose: z.string().optional(),
  frequency: z.string().optional(),
  startedAt: z.coerce.date().optional(),
  stoppedAt: z.coerce.date().nullable().optional(),
});

export const Targets = z.object({
  caloriesKcal: z.number().int().positive().max(8000).optional(),
  proteinG: z.number().positive().max(400).optional(),
  phosphorusMg: z.number().positive().max(5000).optional(),
  potassiumMg: z.number().positive().max(10000).optional(),
  sodiumMg: z.number().positive().max(20000).optional(),
  fluidMl: z.number().positive().max(8000).optional(),
});

export const CareTeamMember = z.object({
  role: z.string().min(1),
  name: z.string().optional(),
  org: z.string().optional(),
  contact: z.string().optional(),
});

export const UserClinical_Base = z.object({
  orgId: z.string().min(1).optional(),
  patientId: ObjectIdString, // Foreign Key (FK) → patients._id
  ckdStage: CKDStage.nullable().optional(), // CKD = Chronic Kidney Disease
  egfrCurrent: z.number().positive().max(200).nullable().optional(), // eGFR = estimated Glomerular Filtration Rate (mL/min/1.73m²)
  acrCategory: ACR.nullable().optional(),
  dialysisStatus: DialysisStatus.default("none"),

  diagnoses: z.array(Dx).default([]),
  medications: z.array(Med).default([]),
  allergies: z.array(z.string()).default([]),
  dietaryPreferences: z.array(z.string()).default([]),
  contraindications: z.array(z.string()).default([]),

  targets: Targets.optional(),
  careTeam: z.array(CareTeamMember).default([]),

  weightKg: z.number().positive().max(400).nullable().optional(),
  heightCm: z.number().positive().max(260).nullable().optional(),

  lastClinicalUpdateAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  createdBy: PrincipalId.optional(),
  updatedBy: PrincipalId.optional(),
});

export const UserClinical_Create = UserClinical_Base.omit({
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
});

// --- Form ---
const numberLike = z
  .string()
  .optional()
  .refine(
    (val) => !val || val.trim() === "" || !Number.isNaN(Number(val)),
    "Enter a number"
  );

const TargetsForm = z.object({
  caloriesKcal: numberLike,
  proteinG: numberLike,
  phosphorusMg: numberLike,
  potassiumMg: numberLike,
  sodiumMg: numberLike,
  fluidMl: numberLike,
});

const LabeledString = z.object({
  value: z.string().min(1),
});

export const ClinicalFormSchema = z.object({
  ckdStage: z.enum(["", ...CKD_STAGE_VALUES] as const),
  egfrCurrent: numberLike,
  acrCategory: z.enum(["", ...ACR.options]),
  dialysisStatus: DialysisStatus,
  weightKg: numberLike,
  heightCm: numberLike,
  diagnoses: z
    .array(
      z.object({
        label: z.string().min(1, "Diagnosis label required"),
        code: z.string().optional(),
      })
    )
    .default([]),
  allergies: z.array(LabeledString).default([]),
  dietaryPreferences: z.array(LabeledString).default([]),
  contraindications: z.array(LabeledString).default([]).optional(),
  careTeam: z
    .array(
      z.object({
        role: z.string().min(1, "Role is required"),
        name: z.string().optional(),
        org: z.string().optional(),
        contact: z.string().optional(),
      })
    )
    .default([]),
});
export const UserClinicalSummary = UserClinical_Base.pick({
  ckdStage: true,
  egfrCurrent: true,
  dialysisStatus: true,
  lastClinicalUpdateAt: true,
  targets: true,
});

export type TUserClinicalSummary = z.infer<typeof UserClinicalSummary>;

export type TClinicalFormValues = z.infer<typeof ClinicalFormSchema>;

export const UserClinical_Update = UserClinical_Base.partial();

export type TUserClinical = z.infer<typeof UserClinical_Base>;
export type TUserClinicalCreate = z.infer<typeof UserClinical_Create>;
export type TUserClinicalUpdate = z.infer<typeof UserClinical_Update>;
