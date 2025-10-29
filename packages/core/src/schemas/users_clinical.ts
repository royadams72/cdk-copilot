import { z } from "zod";
import { PrincipalId } from "./common";

export const DialysisStatus = z.enum([
  "none",
  "hemodialysis",
  "peritoneal",
  "post-transplant",
]);
export const ACR = z.enum(["A1", "A2", "A3"]); // Albumin-to-Creatinine Ratio category

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
  userId: z.string().min(1), // Foreign Key (FK) → users_pii.id
  ckdStage: z
    .union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ])
    .nullable()
    .optional(), // CKD = Chronic Kidney Disease
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
export const UserClinical_Update = UserClinical_Base.partial();

export type TUserClinical = z.infer<typeof UserClinical_Base>;
export type TUserClinicalCreate = z.infer<typeof UserClinical_Create>;
export type TUserClinicalUpdate = z.infer<typeof UserClinical_Update>;
