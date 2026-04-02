import type {
  TFoodNutrients,
  TNutrientProvenanceEntry,
  TResolutionConfidence,
} from "@ckd/core";

const NUTRIENT_KEYS = [
  "caloriesKcal",
  "carbsG",
  "fatG",
  "fiberG",
  "phosphorusMg",
  "potassiumMg",
  "proteinG",
  "sodiumMg",
] as const;

type NutrientKey = (typeof NUTRIENT_KEYS)[number];

type MergeInput = {
  off: TFoodNutrients;
  cofid?: TFoodNutrients | null;
};

export function mergeNutrients({
  off,
  cofid,
}: MergeInput): { nutrients: TFoodNutrients; provenance: TNutrientProvenanceEntry[] } {
  const nutrients: Partial<TFoodNutrients> = {};
  const provenance: TNutrientProvenanceEntry[] = [];

  for (const key of NUTRIENT_KEYS) {
    const offValue = normalizeNumber(off[key]);
    const cofidValue = normalizeNumber(cofid?.[key]);
    const selectedValue = offValue ?? cofidValue;

    if (selectedValue !== undefined) {
      nutrients[key] = round(selectedValue);
    }

    provenance.push({
      confidence: getNutrientConfidence(key, offValue, cofidValue),
      nutrient: key,
      source:
        offValue !== undefined
          ? "open_food_facts_label"
          : cofidValue !== undefined
            ? "cofid_reference"
            : "unknown",
      value: selectedValue ?? null,
    });
  }

  return {
    nutrients,
    provenance,
  };
}

function getNutrientConfidence(
  key: NutrientKey,
  offValue: number | undefined,
  cofidValue: number | undefined,
): TResolutionConfidence {
  if (offValue !== undefined) return "high";
  if (cofidValue === undefined) return "low";
  if (key === "potassiumMg" || key === "phosphorusMg") return "medium";
  return "low";
}

function normalizeNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
