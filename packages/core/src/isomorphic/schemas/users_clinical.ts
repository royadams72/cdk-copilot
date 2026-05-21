import { z } from "zod";
import {
  CKD_STAGE_VALUES,
  CKDStage,
  ObjectIdString,
  PrincipalId,
} from "./common";
const errors = {
  egfr: "Please enter a valid eGFR",
  height: "Please enter a valid height",
  weight: "Please enter a valid weight",
};

export const DialysisStatus = z.enum([
  "none",
  "hemodialysis",
  "peritoneal",
  "post-transplant",
]);
export const ACR = z.enum(["A1", "A2", "A3"]); // Albumin-to-Creatinine Ratio category

const Dx = z.object({ code: z.string().optional(), label: z.string().min(1) });
const Med = z.object({
  dose: z.string().optional(),
  frequency: z.string().optional(),
  name: z.string().min(1),
  startedAt: z.coerce.date().optional(),
  stoppedAt: z.coerce.date().nullable().optional(),
});

export const CareTeamMember = z.object({
  contact: z.string().optional(),
  name: z.string().optional(),
  org: z.string().optional(),
  role: z.string().min(1),
});

export const UserClinical_Base = z.object({
  orgId: z.string().min(1).optional(),
  patientId: ObjectIdString, // Foreign Key (FK) → patients._id
  principalId: PrincipalId.optional(),
  ckdStage: CKDStage.nullable().optional(), // CKD = Chronic Kidney Disease
  egfrCurrent: z
    .number()
    .positive()
    .max(3)
    .nullable()
    .refine((v) => v !== null, {
      message: "Please enter your last eGFR reading",
    }), // eGFR = estimated Glomerular Filtration Rate (mL/min/1.73m²)
  acrCategory: ACR.nullable().optional(),
  dialysisStatus: DialysisStatus.default("none"),

  diagnoses: z.array(Dx).default([]),
  medications: z.array(Med).default([]),
  allergies: z.array(z.string()).default([]),
  dietaryPreferences: z.array(z.string()).default([]),
  contraindications: z.array(z.string()).default([]),

  careTeam: z.array(CareTeamMember).default([]),

  weightKg: z
    .number()
    .positive()
    .max(400)
    .nullable()
    .refine((v) => v !== null, { message: "Please enter your weight" }),
  heightCm: z
    .number()
    .positive()
    .max(260)
    .nullable()
    .refine((v) => v !== null, { message: "Please enter your weight" }),

  lastClinicalUpdateAt: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
  createdBy: PrincipalId.optional(),
  updatedBy: PrincipalId.optional(),
});

export const UserClinical_Create = UserClinical_Base.omit({
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
});

// --- Form ---
const numberLike = (options?: { invalid?: string; required?: string }) => {
  const requiredMsg = options?.required ?? "This field is required";
  const invalidMsg = options?.invalid ?? "Enter a valid number";
  return z
    .string()
    .min(1, requiredMsg)
    .refine((val) => !Number.isNaN(Number(val)), invalidMsg);
};

const LabeledString = z.object({
  value: z.string().min(1),
});

export const ClinicalFormSchema = z.object({
  acrCategory: z.enum(["", ...ACR.options]),
  allergies: z.array(LabeledString).default([]),
  careTeam: z
    .array(
      z.object({
        contact: z.string().optional(),
        name: z.string().optional(),
        org: z.string().optional(),
        role: z.string().min(1, "Role is required"),
      }),
    )
    .default([]),
  ckdStage: z.enum(CKD_STAGE_VALUES, { message: "CKD stage is required" }),
  contraindications: z.array(LabeledString).default([]).optional(),
  diagnoses: z
    .array(
      z.object({
        code: z.string().optional(),
        label: z.string().min(1, "Diagnosis label required"),
      }),
    )
    .default([]),
  dialysisStatus: DialysisStatus,
  dietaryPreferences: z.array(LabeledString).default([]),
  egfrCurrent: numberLike({ invalid: errors.egfr, required: errors.egfr }),
  heightCm: numberLike({ invalid: errors.height, required: errors.height }),
  weightKg: numberLike({ invalid: errors.weight, required: errors.weight }),
});
export const UserClinicalSummary = UserClinical_Base.pick({
  ckdStage: true,
  dialysisStatus: true,
  egfrCurrent: true,
  lastClinicalUpdateAt: true,
});

export type TUserClinicalSummary = z.infer<typeof UserClinicalSummary>;

export type TClinicalFormValues = z.infer<typeof ClinicalFormSchema>;

export const UserClinical_Update = UserClinical_Base.partial();

export type TUserClinical = z.infer<typeof UserClinical_Base>;
export type TUserClinicalCreate = z.infer<typeof UserClinical_Create>;
export type TUserClinicalUpdate = z.infer<typeof UserClinical_Update>;
