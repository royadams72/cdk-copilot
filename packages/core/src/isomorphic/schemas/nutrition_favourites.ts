import { z } from "zod";

import { objectIdHex } from "./common";
import { FoodItemEntry } from "./nutrition";

const MealType = z.enum(["breakfast", "lunch", "dinner", "snack", "drink"]);
const NutritionFavouriteKind = z.enum(["food", "meal"]);

const FavouriteFoodSnapshot = FoodItemEntry.extend({
  mealType: MealType.optional(),
});

const FavouriteMealSnapshot = z.object({
  items: z.array(FoodItemEntry).min(1),
  mealType: MealType.optional(),
  totals: z.object({
    caloriesKcal: z.number().nonnegative().max(5000).optional(),
    carbsG: z.number().nonnegative().max(600).optional(),
    fatG: z.number().nonnegative().max(300).optional(),
    fiberG: z.number().nonnegative().max(200).optional(),
    phosphorus_protein_ratio: z.number().nonnegative().max(300).optional(),
    phosphorusMg: z.number().nonnegative().max(5000).optional(),
    potassiumMg: z.number().nonnegative().max(10000).optional(),
    proteinG: z.number().nonnegative().max(300).optional(),
    sodiumMg: z.number().nonnegative().max(20000).optional(),
  }),
});

export const NutritionFavourite = z.discriminatedUnion("kind", [
  z.object({
    patientId: objectIdHex,
    kind: z.literal("food"),
    signature: z.string().min(1),
    label: z.string().min(1),
    mealType: MealType.optional(),
    timesUsed: z.number().int().nonnegative(),
    isFavourite: z.boolean(),
    lastUsedAt: z.coerce.date(),
    snapshot: FavouriteFoodSnapshot,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  }),
  z.object({
    patientId: objectIdHex,
    kind: z.literal("meal"),
    signature: z.string().min(1),
    label: z.string().min(1),
    mealType: MealType.optional(),
    timesUsed: z.number().int().nonnegative(),
    isFavourite: z.boolean(),
    lastUsedAt: z.coerce.date(),
    snapshot: FavouriteMealSnapshot,
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  }),
]);

export type TNutritionFavourite = z.infer<typeof NutritionFavourite>;
export type TNutritionFavouriteKind = z.infer<typeof NutritionFavouriteKind>;
export type TNutritionFavouriteFood = Extract<
  TNutritionFavourite,
  { kind: "food" }
>;
export type TNutritionFavouriteMeal = Extract<
  TNutritionFavourite,
  { kind: "meal" }
>;
