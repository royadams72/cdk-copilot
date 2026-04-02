import {
  TEdamamMeasure,
  TEdamamNutritionLookupItem,
  TFoodItem,
} from "@ckd/core";

export function setNutrientsBody({
  foodItems,
}: {
  foodItems: TFoodItem[] | TFoodItem | null;
}): TEdamamNutritionLookupItem[] | undefined {
  if (!foodItems) return;
  const items = Array.isArray(foodItems) ? foodItems : [foodItems];
  return items.map((foodItem) => {
    return {
      brand: foodItem.brand,
      foodId: foodItem.foodId,
      foodName: foodItem.name,
      measures: foodItem.measures ?? [],
      originalText: foodItem.name,
      quantity: foodItem.quantity,
      source: foodItem.source,
      unit: sanitizeUnitForLookup(foodItem.unit),
    };
  });
}

export function inferUnitFromMeasures(
  measures: TEdamamMeasure[],
  unit: string,
  foodName?: string,
  quantity = 1,
  originalText?: string,
) {
  return getMeasureInfo(measures, unit, foodName, quantity, originalText).label;
}

function getMeasureInfo(
  measures: TEdamamMeasure[],
  unit: string,
  foodName?: string,
  quantity = 1,
  originalText?: string,
): {
  label: string;
  measureURI: string;
  qualifiers?: string[];
} {
  if (!measures?.length) {
    return { label: "", measureURI: "" };
  }

  const normalizedUnit = unit.trim().toLowerCase();
  const normalizedFood = foodName?.trim().toLowerCase() ?? "";
  const normalizedOriginal = originalText?.trim().toLowerCase() ?? "";
  const effectiveUnit = shouldIgnoreInferredPieceUnit(
    normalizedUnit,
    normalizedOriginal,
    quantity,
  )
    ? ""
    : normalizedUnit;

  const resolveMeasure = (
    measure: TEdamamMeasure,
  ): {
    label: string;
    measureURI: string;
    qualifiers?: string[];
  } => {
    if (Array.isArray(measure.qualified) && measure.qualified.length > 0) {
      const qualifierUris = Array.from(
        new Set(
          measure.qualified.flatMap((q) => q.qualifiers.map((b) => b.uri)),
        ),
      );
      return {
        label: measure.label,
        measureURI: measure.uri,
        qualifiers: qualifierUris,
      };
    }
    return { label: measure.label, measureURI: measure.uri };
  };

  const findMeasure = (labels: string[]) =>
    measures.find((measure) =>
      labels.some(
        (label) => (measure.label ?? "").trim().toLowerCase() === label,
      ),
    );

  if (effectiveUnit) {
    const match = findMeasure([effectiveUnit]);
    if (match) return resolveMeasure(match);
  }
  if (shouldPreferServing(quantity, effectiveUnit, normalizedOriginal)) {
    const servingMeasure = findMeasure(["serving"]);
    if (servingMeasure) return resolveMeasure(servingMeasure);
  }

  if (normalizedFood) {
    const match = measures.find((measure) =>
      normalizedFood.includes((measure.label ?? "").trim().toLowerCase()),
    );
    if (match) return resolveMeasure(match);
  }

  const fallbackOrder = ["serving", "gram", "ounce", "pound", "kilogram"];
  for (const label of fallbackOrder) {
    const match = measures.find(
      (measure) => (measure.label ?? "").trim().toLowerCase() === label,
    );
    if (match) return resolveMeasure(match);
  }

  return resolveMeasure(measures[0]);
}

function shouldPreferServing(
  quantity: number,
  normalizedUnit: string,
  normalizedOriginal: string,
) {
  if (normalizedOriginal) {
    if (/\bwhole\b/.test(normalizedOriginal)) return false;

    const hasExplicitMeasure =
      /\b(g|gram|grams|kg|kilogram|kilograms|oz|ounce|ounces|lb|lbs|pound|pounds|ml|milliliter|milliliters|l|liter|liters|cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|slice|slices|piece|pieces|serving|servings)\b/.test(
        normalizedOriginal,
      );
    if (hasExplicitMeasure) return false;
  }

  return !normalizedUnit && Number.isInteger(quantity) && quantity > 0;
}

function shouldIgnoreInferredPieceUnit(
  normalizedUnit: string,
  normalizedOriginal: string,
  quantity: number,
) {
  if (!normalizedUnit || !normalizedOriginal) return false;
  if (!Number.isInteger(quantity) || quantity <= 0) return false;
  if (!/^\s*\d+(\.0+)?\s+/.test(normalizedOriginal)) return false;

  const explicitMeasurePattern =
    /\b(g|gram|grams|kg|kilogram|kilograms|oz|ounce|ounces|lb|lbs|pound|pounds|ml|milliliter|milliliters|l|liter|liters|cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|slice|slices|piece|pieces|serving|servings)\b/;

  if (explicitMeasurePattern.test(normalizedOriginal)) return false;

  return ["leg", "drumstick", "thigh", "wing", "breast", "whole"].includes(
    normalizedUnit,
  );
}

function sanitizeUnitForLookup(unit?: string) {
  const normalizedUnit = (unit ?? "").trim().toLowerCase();
  if (!normalizedUnit) return undefined;
  if (["leg", "drumstick", "thigh", "wing", "breast"].includes(normalizedUnit)) {
    return undefined;
  }
  return unit;
}
