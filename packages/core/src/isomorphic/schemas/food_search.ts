import { z } from "zod";
import { EdamamMeasureSchema } from "./edamam";

export const FoodSearchProvider = z.enum(["edamam"]);

export const SearchFoodNutrientsSchema = z.object({
  caloriesKcal: z.number().nonnegative().optional(),
  carbsG: z.number().nonnegative().optional(),
  fatG: z.number().nonnegative().optional(),
  fiberG: z.number().nonnegative().optional(),
  phosphorusMg: z.number().nonnegative().optional(),
  potassiumMg: z.number().nonnegative().optional(),
  proteinG: z.number().nonnegative().optional(),
  sodiumMg: z.number().nonnegative().optional(),
});

export const FoodSearchCandidateSchema = z.object({
  provider: FoodSearchProvider,
  food: z.object({
    foodId: z.string(),
    label: z.string(),
    knownAs: z.string().optional(),
    brand: z.string().optional(),
    category: z.string().optional(),
    categoryLabel: z.string().optional(),
    image: z.string().optional(),
    nutrients: SearchFoodNutrientsSchema,
  }),
  measures: z.array(EdamamMeasureSchema).default([]),
});

export const LogMealSearchResponseItemSchema = z.object({
  tempId: z.string(),
  item: z.object({
    original: z.string(),
    normalised: z.string(),
    quantity: z.number(),
    unit: z.string().nullable(),
    food: z.string(),
  }),
  matches: z.array(FoodSearchCandidateSchema).nullable(),
});

export const LogMealSearchResponseSchema = z.object({
  items: z.array(LogMealSearchResponseItemSchema),
  requestId: z.string(),
});

export type TSearchFoodNutrients = z.infer<typeof SearchFoodNutrientsSchema>;
export type TFoodSearchProvider = z.infer<typeof FoodSearchProvider>;
export type TFoodSearchCandidate = z.infer<typeof FoodSearchCandidateSchema>;
export type TLogMealSearchResponseItem = z.infer<
  typeof LogMealSearchResponseItemSchema
>;
export type TLogMealSearchResponse = z.infer<typeof LogMealSearchResponseSchema>;
