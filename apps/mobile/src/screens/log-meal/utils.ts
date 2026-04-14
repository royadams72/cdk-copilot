import { TFoodItem, TMealType } from "@ckd/core";
import type { TIngredientCandidate } from "../../../../../packages/core/src/isomorphic/schemas/nutrient_estimation";

type FoodItemWithEstimateContext = TFoodItem & {
  foodContentsLabel?: string;
  ingredientCandidates?: TIngredientCandidate[];
};

export type MealData = Record<TMealType, TFoodItem[]> & {
  eatenAt: string;
  entryId?: string;
};
export function mapForSaveOrUpdate(
  eatenAtIso: string | null | undefined,
  meal: TFoodItem[],
  mealType: TMealType,
  entryId?: string,
) {
  const payload = {
    [mealType]: meal,
    eatenAt: eatenAtIso ?? new Date().toISOString(),
  } as MealData;
  if (entryId) {
    payload.entryId = entryId;
  }
  return payload;
}

export const hasMissingCoreNutrients = (food: TFoodItem) => {
  const foodWithEstimateContext = food as FoodItemWithEstimateContext;
  const nutrients = food.nutrients ?? {};
  const isEstimateEligible =
    Boolean(food.brand?.trim()) ||
    Boolean(foodWithEstimateContext.foodContentsLabel?.trim()) ||
    Boolean(foodWithEstimateContext.ingredientCandidates?.length);

  return (
    nutrients.caloriesKcal == null ||
    nutrients.proteinG == null ||
    nutrients.phosphorusMg == null ||
    nutrients.potassiumMg == null ||
    nutrients.sodiumMg == null ||
    (isEstimateEligible &&
      ((typeof nutrients.phosphorusMg === "number" &&
        nutrients.phosphorusMg <= 0) ||
        (typeof nutrients.potassiumMg === "number" &&
          nutrients.potassiumMg <= 0)))
  );
};
