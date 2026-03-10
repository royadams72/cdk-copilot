import { TFoodItem, TMealType } from "@ckd/core";

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
