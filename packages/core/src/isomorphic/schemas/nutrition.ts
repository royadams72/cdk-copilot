// zod-schemas/nutrition.ts
import { z } from "zod";
import { objectIdHex } from "./common";
import { EdamamMeasureSchema } from "./edamam";
import { FoodTaxonomySnapshot } from "./food_taxonomy";
import { OpenFoodFactsSelectionSchema } from "./food_search";

const MealType = z.enum(["breakfast", "lunch", "dinner", "snack", "drink"]);
export const NutrientKey = z.enum([
  "caloriesKcal",
  "proteinG",
  "phosphorusMg",
  "potassiumMg",
  "sodiumMg",
  "phosphorus_protein_ratio",
]);
const Nutrients = z.object({
  caloriesKcal: z.number().nonnegative().max(5000).optional(),
  carbsG: z.number().nonnegative().max(600).optional(),
  fatG: z.number().nonnegative().max(300).optional(),
  fiberG: z.number().nonnegative().max(200).optional(),
  phosphorus_protein_ratio: z.number().nonnegative().max(300).optional(),
  phosphorusMg: z.number().nonnegative().max(5000).optional(),
  potassiumMg: z.number().nonnegative().max(10000).optional(),
  proteinG: z.number().nonnegative().max(300).optional(),
  sodiumMg: z.number().nonnegative().max(20000).optional(),
  source: z.string().optional(),
  unit: z.string().optional(),
});

const FoodItem = z.object({
  name: z.string(),
  uid: z.string(),
  foodId: z.string(), // your DB or external ID
  groupId: z.string().optional(), // groupId should be omitted when persisted to DB
  brand: z.string().optional(),
  quantity: z.number().nonnegative().max(600),
  preparation: z.string().optional(), // "grilled", "boiled", etc.
  nutrients: Nutrients, // per this portion
  source: z.enum(["user", "barcode", "image_ai", "api"]).default("user"),
  taxonomy: FoodTaxonomySnapshot.optional(),
  measures: z.array(EdamamMeasureSchema), // measures should be omitted when persisted to DB
  unit: z.string(),
  openFoodFacts: OpenFoodFactsSelectionSchema.optional(),
});

export const FoodItemEntry = FoodItem.omit({
  groupId: true,
  measures: true,
});

export const NutritionEntry = z.object({
  patientId: objectIdHex,
  eatenAt: z.coerce.date(), // when the meal was consumed
  items: z.array(FoodItemEntry).min(1),
  totals: Nutrients, // sum of items (precomputed)
  mealType: MealType,
  tags: z.array(z.string()).default([]), // e.g., ["high-protein"]
  photos: z.array(z.url()).default([]),
  recipeId: z.string().optional(), // if linked to a saved recipe
  notes: z.string().optional(),
  createdAt: z.coerce.date(), // when the meal was consumed
  updatedAt: z.coerce.date(), // when the meal was consumed
  updatedBy: objectIdHex.optional(),
  status: z.enum(["active", "deleted"]).default("active"),
  deletedAt: z.coerce.date().optional(),
  deletedBy: z.enum(["patient", "clinician", "dietitian", "admin"]).optional(),
});

export type TFoodItemEntry = z.infer<typeof FoodItemEntry>;
export type TNutritionEntry = z.infer<typeof NutritionEntry>;
export type TFoodItem = z.infer<typeof FoodItem>;
export type TNutrients = z.infer<typeof Nutrients>;
export type TMealType = z.infer<typeof MealType>;
export type TNutrientKey = z.infer<typeof NutrientKey>;
