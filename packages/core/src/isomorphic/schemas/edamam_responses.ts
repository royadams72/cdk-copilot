import { z } from "zod";
import { EdamamMeasureSchema } from "./edamam";
import {
  IngredientCandidateSchema,
  NutrientEstimateSchema,
} from "./nutrient_estimation";

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
  food: z.string(),
  foodId: z.string(),
  measure: z.string(),
  measureURI: z.url(),
  quantity: z.number(),
  retainedWeight: z.number().optional(),
  status: z.string(),
  weight: z.number(),
});

export const EdamamNutritionResponseSchema = z.object({
  calories: z.number(),
  cautions: z.array(z.string()),
  dietLabels: z.array(z.string()),

  healthLabels: z.array(z.string()),
  ingredients: z.array(
    z.object({
      parsed: z.array(ParsedIngredientSchema),
    }),
  ),
  totalDaily: z.record(z.string(), NutrientEntrySchema),

  totalNutrients: z.record(z.string(), NutrientEntrySchema),
  totalWeight: z.number(),

  uri: z.url(),
});

export const EdamamNutritionLookupItemSchema = z.object({
  foodId: z.string(),
  foodName: z.string().optional(),
  source: z.enum(["user", "image_ai", "api"]).optional(),
  brand: z.string().optional(),
  foodContentsLabel: z.string().optional(),
  ingredientCandidates: z.array(IngredientCandidateSchema).optional(),
  measures: z.array(EdamamMeasureSchema).default([]),
  measureURI: z.string().optional(),
  originalText: z.string().optional(),
  quantity: z.number(),
  unit: z.string().optional(),
});

export const EdamamResolvedMeasureSchema = z.object({
  label: z.string(),
  measureURI: z.string(),
  qualifiers: z.array(z.string()).optional(),
});

export const EdamamNutritionLookupResultSchema = z.object({
  requestedFoodId: z.string(),
  resolvedMeasure: EdamamResolvedMeasureSchema,
  estimate: NutrientEstimateSchema.optional(),
  response: EdamamNutritionResponseSchema,
});

export type TEdamamNutritionResponse = z.infer<
  typeof EdamamNutritionResponseSchema
>;
export type TEdamamNutritionLookupItem = z.infer<
  typeof EdamamNutritionLookupItemSchema
>;
export type TEdamamResolvedMeasure = z.infer<
  typeof EdamamResolvedMeasureSchema
>;
export type TEdamamNutritionLookupResult = z.infer<
  typeof EdamamNutritionLookupResultSchema
>;
