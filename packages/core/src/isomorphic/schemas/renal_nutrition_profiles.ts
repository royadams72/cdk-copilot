import { z } from "zod";

import { objectIdHex } from "./common";

const trimmedStringArray = z.array(z.string().trim().min(1)).default([]);

export const RenalNutritionProfileActor = z
  .object({
    actorType: z.enum(["patient", "clinician", "dietitian", "admin", "system"]),
    displayName: z.string().nullable().optional(),
    principalId: z.string().min(1),
  })
  .strict();

export const RenalNutritionProfileCurrent_Base = z
  .object({
    _id: objectIdHex,
    allergyIntolerances: trimmedStringArray,
    createdAt: z.date(),
    createdBy: RenalNutritionProfileActor,
    dietaryRestrictions: trimmedStringArray,
    fluidLimitLitres: z.number().positive().nullable().optional(),
    notesFromDietitian: z.string().trim().nullable().optional(),
    orgId: z.string().min(1).nullable().optional(),
    patientId: objectIdHex,
    renalDietGuidance: z.string().trim().nullable().optional(),
    reviewDueDate: z.date().nullable().optional(),
    updatedAt: z.date(),
    updatedBy: RenalNutritionProfileActor,
  })
  .strict();

export const RenalNutritionProfileCurrent_Upsert =
  RenalNutritionProfileCurrent_Base.omit({
    _id: true,
  });

export type TRenalNutritionProfileCurrent = z.infer<
  typeof RenalNutritionProfileCurrent_Base
>;
