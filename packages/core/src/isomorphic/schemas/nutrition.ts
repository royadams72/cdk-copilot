// zod-schemas/nutrition.ts
import { z } from "zod";
import { PrincipalId } from "./common";
import { EdamamMeasureSchema } from "./edamam";

const MealType = z.enum(["breakfast", "lunch", "dinner", "snack", "drink"]);

const Nutrients = z.object({
  caloriesKcal: z.number().nonnegative().max(5000).optional(),
  proteinG: z.number().nonnegative().max(300).optional(),
  carbsG: z.number().nonnegative().max(600).optional(),
  fatG: z.number().nonnegative().max(300).optional(),
  fiberG: z.number().nonnegative().max(200).optional(),
  phosphorusMg: z.number().nonnegative().max(5000).optional(),
  potassiumMg: z.number().nonnegative().max(10000).optional(),
  sodiumMg: z.number().nonnegative().max(20000).optional(),
});

const FoodItem = z.object({
  name: z.string(),
  foodId: z.string().optional(), // your DB or external ID
  groupId: z.string().optional(),
  brand: z.string().optional(),
  quantity: z.number().nonnegative().max(600),
  preparation: z.string().optional(), // "grilled", "boiled", etc.
  nutrients: Nutrients, // per this portion
  source: z.enum(["user", "barcode", "image_ai", "api"]).default("user"),
  measures: z.array(EdamamMeasureSchema),
});

export const NutritionEntry = z.object({
  patientId: PrincipalId,
  eatenAt: z.coerce.date(), // when the meal was consumed
  recordedAt: z.coerce.date().default(() => new Date()),
  mealType: MealType,
  items: z.array(FoodItem).min(1),
  totals: Nutrients, // sum of items (precomputed)
  tags: z.array(z.string()).default([]), // e.g., ["high-protein"]
  photos: z.array(z.url()).default([]),
  recipeId: z.string().optional(), // if linked to a saved recipe
  notes: z.string().optional(),
  createdAt: z.coerce.date(), // when the meal was consumed
  createdBy: PrincipalId.optional(),
  updatedBy: PrincipalId.optional(),
  version: z.number().int().default(1),
});

export type TNutritionEntry = z.infer<typeof NutritionEntry>;
export type TFoodItem = z.infer<typeof FoodItem>;
export type TNutrients = z.infer<typeof Nutrients>;
