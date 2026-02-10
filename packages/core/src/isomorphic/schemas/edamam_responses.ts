import { z } from "zod";

/**
 * Generic nutrient entry: label + quantity + unit
 */
export const NutrientEntrySchema = z.object({
  label: z.string(),
  quantity: z.number(),
  unit: z.string(),
});

/**
 * Parsed ingredient row (inside ingredients[].parsed[])
 */
export const ParsedIngredientSchema = z.object({
  quantity: z.number(),
  measure: z.string(),
  food: z.string(),
  foodId: z.string(),
  weight: z.number(),
  retainedWeight: z.number().optional(),
  measureURI: z.url(),
  status: z.string(),
});

/**
 * Top-level response schema (based on your sample)
 */
export const EdamamNutritionResponseSchema = z.object({
  uri: z.url(),
  calories: z.number(),
  totalWeight: z.number(),

  dietLabels: z.array(z.string()),
  healthLabels: z.array(z.string()),
  cautions: z.array(z.string()),

  totalNutrients: z.record(z.string(), NutrientEntrySchema),

  // NOTE: Your sample contains a likely type bug:
  // totalDaily.CHOCDF.net.unit is "g" while the rest are "%".
  // So we allow either "%"/"g"/any string to be safe.
  totalDaily: z.record(z.string(), NutrientEntrySchema),

  ingredients: z.array(
    z.object({
      parsed: z.array(ParsedIngredientSchema),
    })
  ),
});

export type TEdamamNutritionResponse = z.infer<
  typeof EdamamNutritionResponseSchema
>;
