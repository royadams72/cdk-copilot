import { z } from "zod";

export const EstimatedNutrientKeySchema = z.enum([
  "phosphorusMg",
  "potassiumMg",
]);

export const IngredientCandidateSchema = z.object({
  name: z.string(),
  percent: z.number().positive().max(100).optional(),
  source: z.enum(["parsed", "label"]).optional(),
});

export const NutrientEstimateBreakdownSchema = z.object({
  amountMg: z.number().nonnegative(),
  assignedPercent: z.number().nonnegative().max(100),
  ingredient: z.string(),
  ingredientWeightG: z.number().nonnegative(),
  matchedFood: z.string().optional(),
  mgPer100g: z.number().nonnegative(),
  nutrientKey: EstimatedNutrientKeySchema,
});

export const NutrientEstimateSchema = z.object({
  breakdown: z.array(NutrientEstimateBreakdownSchema).default([]),
  missingIngredients: z.array(z.string()).default([]),
  nutrientKeys: z.array(EstimatedNutrientKeySchema).default([]),
  warning: z.string().optional(),
});

export type TEstimatedNutrientKey = z.infer<typeof EstimatedNutrientKeySchema>;
export type TIngredientCandidate = z.infer<typeof IngredientCandidateSchema>;
export type TNutrientEstimateBreakdown = z.infer<
  typeof NutrientEstimateBreakdownSchema
>;
export type TNutrientEstimate = z.infer<typeof NutrientEstimateSchema>;
