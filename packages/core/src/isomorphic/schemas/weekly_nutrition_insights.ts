import { z } from "zod";
import { objectIdHex } from "./common";
import { PatientGoalCode } from "./patient_goals";

export const WeeklyNutritionGoal = PatientGoalCode;

export const WeeklyNutritionFinding = z
  .object({
    type: z.string().min(1),
    severity: z.enum(["low", "moderate", "high"]),
    actual: z.number(),
    target: z.number(),
    topFoods: z.array(z.string()).default([]),
    topContributors: z
      .array(
        z
          .object({
            contribution: z.number(),
            food: z.string().min(1),
            nutrientAmount: z.number(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

export const WeeklyNutritionSuggestion = z
  .object({
    fromFood: z.string().min(1),
    reason: z.enum(["phosphorus", "potassium", "sodium", "protein", "calories"]),
    alternatives: z.array(z.string()).min(1),
  })
  .strict();

export const WeeklyNutritionInsight = z
  .object({
    patientId: objectIdHex,
    weekStart: z.string().min(1),
    weekEnd: z.string().min(1),
    goal: WeeklyNutritionGoal,
    findings: z.array(WeeklyNutritionFinding).default([]),
    suggestions: z.array(WeeklyNutritionSuggestion).default([]),
    humanMessage: z.string().min(1),
    generatedAt: z.coerce.date(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();

export type TWeeklyNutritionGoal = z.infer<typeof WeeklyNutritionGoal>;
export type TWeeklyNutritionFinding = z.infer<typeof WeeklyNutritionFinding>;
export type TWeeklyNutritionSuggestion = z.infer<
  typeof WeeklyNutritionSuggestion
>;
export type TWeeklyNutritionInsight = z.infer<typeof WeeklyNutritionInsight>;
