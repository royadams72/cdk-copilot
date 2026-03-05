import { TEdamamMeasure, TFoodItem } from "@ckd/core";

export function setNutrientsBody({
  foodItems,
}: {
  foodItems: TFoodItem[] | TFoodItem | null;
}) {
  if (!foodItems) return;
  const items = Array.isArray(foodItems) ? foodItems : [foodItems];
  return items.map((foodItem) => {
    const unit = foodItem?.unit?.trim() ?? "";
    const { measureURI, qualifiers } = getMeasureUri(
      foodItem.measures,
      unit,
      foodItem.name,
    );

    return {
      foodId: foodItem.foodId,
      measureURI,
      qualifiers,
      quantity: foodItem.quantity,
    };
  });
}

function getMeasureUri(
  measures: TEdamamMeasure[],
  unit: string,
  foodName?: string,
): { measureURI: string; qualifiers?: string[] } {
  if (!measures?.length) return { measureURI: "" };

  const normalizedUnit = unit.trim().toLowerCase();
  const normalizedFood = foodName?.trim().toLowerCase() ?? "";

  const resolveMeasure = (
    measure: TEdamamMeasure,
  ): { measureURI: string; qualifiers?: string[] } => {
    if (Array.isArray(measure.qualified) && measure.qualified.length > 0) {
      const qualifierUris = Array.from(
        new Set(
          measure.qualified.flatMap((q) => q.qualifiers.map((b) => b.uri)),
        ),
      );
      return { measureURI: measure.uri, qualifiers: qualifierUris };
    }
    return { measureURI: measure.uri };
  };

  if (normalizedUnit) {
    const match = measures.find(
      (measure) => measure.label.toLowerCase() === normalizedUnit,
    );
    if (match) return resolveMeasure(match);
  }

  if (normalizedFood) {
    const match = measures.find((measure) =>
      normalizedFood.includes(measure.label.toLowerCase()),
    );
    if (match) return resolveMeasure(match);
  }

  const fallbackOrder = [
    "whole",
    "serving",
    "gram",
    "ounce",
    "pound",
    "kilogram",
  ];
  for (const label of fallbackOrder) {
    const match = measures.find(
      (measure) => measure.label.toLowerCase() === label,
    );
    if (match) return resolveMeasure(match);
  }

  return resolveMeasure(measures[0]);
}
