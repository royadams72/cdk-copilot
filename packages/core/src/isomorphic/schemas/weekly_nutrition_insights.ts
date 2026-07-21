import { z } from "zod";
import { objectIdHex } from "./common";
import { PatientGoalCode } from "./patient_goals";

export const WeeklyNutritionGoal = PatientGoalCode;
export const WeeklyNutritionAnalysisMode = z.enum([
  "weekly_average",
  "logged_day_average",
  "insufficient_data",
]);

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

export const WeeklyNutritionInsight = z
  .object({
    patientId: objectIdHex,
    weekStart: z.string().min(1),
    weekEnd: z.string().min(1),
    goal: WeeklyNutritionGoal,
    analysisMode: WeeklyNutritionAnalysisMode,
    loggedDays: z.number().int().min(0).max(7),
    findings: z.array(WeeklyNutritionFinding).default([]),
    humanMessage: z.string().min(1),
    generatedAt: z.coerce.date(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();

export type TWeeklyNutritionGoal = z.infer<typeof WeeklyNutritionGoal>;
export type TWeeklyNutritionAnalysisMode = z.infer<
  typeof WeeklyNutritionAnalysisMode
>;
export type TWeeklyNutritionFinding = z.infer<typeof WeeklyNutritionFinding>;
export type TWeeklyNutritionInsight = z.infer<typeof WeeklyNutritionInsight>;
