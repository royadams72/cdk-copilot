// zod-schemas/nutrition.ts
import { z } from "zod";
import { PrincipalId } from "./common";

const MealType = z.enum(["breakfast", "lunch", "dinner", "snack", "drink"]);

const Portion = z.object({
  amount: z.number().positive(), // 1, 2, 150
  unit: z.enum(["g", "ml", "serving", "piece"]), // normalized units
  grams: z.number().positive().optional(), // resolved grams (if known)
});

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
  foodId: z.string().optional(), // your DB or external ID
  description: z.string(), // "Grilled chicken breast"
  brand: z.string().optional(),
  portion: Portion,
  preparation: z.string().optional(), // "grilled", "boiled", etc.
  nutrients: Nutrients, // per this portion
  source: z.enum(["user", "barcode", "image_ai", "api"]).default("user"),
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
  createdBy: PrincipalId.optional(),
  updatedBy: PrincipalId.optional(),
  version: z.number().int().default(1),
});

export type TNutritionEntry = z.infer<typeof NutritionEntry>;
