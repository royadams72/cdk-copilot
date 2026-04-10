import { z } from "zod";
import { EdamamMeasureSchema } from "./edamam";

export const FoodSearchProvider = z.enum(["edamam", "open_food_facts"]);

export type TOpenFoodFactsIngredient = {
  id?: string;
  ingredients?: TOpenFoodFactsIngredient[];
  percent?: number;
  text?: string;
  vegan?: string;
  vegetarian?: string;
};

export type TOpenFoodFactsSelection = {
  barcode?: string;
  imageUrl?: string;
  ingredients?: TOpenFoodFactsIngredient[];
  ingredientsTags?: string[];
  ingredientsText?: string;
  ingredientsTextLanguage?: string;
  servingSize?: string;
  ukMarketMatch?: boolean;
};

export const OpenFoodFactsIngredientSchema: z.ZodType<TOpenFoodFactsIngredient> =
  z.lazy(() =>
    z.object({
      id: z.string().optional(),
      ingredients: z.array(OpenFoodFactsIngredientSchema).optional(),
      percent: z.number().optional(),
      text: z.string().optional(),
      vegan: z.string().optional(),
      vegetarian: z.string().optional(),
    }),
  );

export const OpenFoodFactsSelectionSchema: z.ZodType<TOpenFoodFactsSelection> =
  z.object({
    barcode: z.string().optional(),
    imageUrl: z.string().optional(),
    ingredients: z.array(OpenFoodFactsIngredientSchema).optional(),
    ingredientsTags: z.array(z.string()).optional(),
    ingredientsText: z.string().optional(),
    ingredientsTextLanguage: z.string().optional(),
    servingSize: z.string().optional(),
    ukMarketMatch: z.boolean().optional(),
  });

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
  metadata: OpenFoodFactsSelectionSchema.optional(),
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

export const FoodMappingConfidence = z.enum(["high", "medium", "low"]);
export const FoodMappingMethod = z.enum([
  "manual",
  "auto_rule",
  "auto_similarity",
  "direct_generic",
]);
export const FoodMappingStatus = z.enum([
  "pending",
  "reviewed",
  "rejected",
  "not_needed",
]);

export const FoodMappingRecordSchema = z.object({
  _id: z.any().optional(),
  source: z.literal("open_food_facts"),
  barcode: z.string().nullable(),
  brand: z.string().nullable(),
  productName: z.string(),
  normalizedName: z.string(),
  edamamMatch: z.object({
    foodId: z.string(),
    foodLabel: z.string(),
  }),
  confidence: FoodMappingConfidence,
  mappingMethod: FoodMappingMethod,
  mappingStatus: FoodMappingStatus,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type TSearchFoodNutrients = z.infer<typeof SearchFoodNutrientsSchema>;
export type TFoodSearchProvider = z.infer<typeof FoodSearchProvider>;
export type TFoodSearchCandidate = z.infer<typeof FoodSearchCandidateSchema>;
export type TLogMealSearchResponseItem = z.infer<
  typeof LogMealSearchResponseItemSchema
>;
export type TLogMealSearchResponse = z.infer<typeof LogMealSearchResponseSchema>;
export type TFoodMappingRecord = z.infer<typeof FoodMappingRecordSchema>;
