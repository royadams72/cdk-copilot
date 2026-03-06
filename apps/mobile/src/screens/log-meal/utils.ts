import { TFoodItem, TMealType } from "@ckd/core";

export type MealData = Record<TMealType, TFoodItem[]> & {
  eatenAt: string;
};
export function mapPayloadForSaveMeal(
  eatenAtIso: string | null | undefined,
  meal: TFoodItem[],
  mealType: TMealType,
) {
  return {
    [mealType]: meal,
    eatenAt: eatenAtIso ?? new Date().toISOString(),
  } as MealData;
}
