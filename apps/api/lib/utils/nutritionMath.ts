type RatioInputs = {
  phosphorusMg?: number | null;
  proteinG?: number | null;
};

type NutrientTotals = {
  caloriesKcal: number;
  phosphorusMg: number;
  potassiumMg: number;
  proteinG: number;
  sodiumMg: number;
  phosphorus_protein_ratio?: number;
};

export function calculatePhosphorusProteinRatio({
  phosphorusMg,
  proteinG,
}: RatioInputs): number | undefined {
  if (
    typeof phosphorusMg !== "number" ||
    !Number.isFinite(phosphorusMg) ||
    phosphorusMg <= 0 ||
    typeof proteinG !== "number" ||
    !Number.isFinite(proteinG) ||
    proteinG <= 0
  ) {
    return undefined;
  }

  return roundNutrient(phosphorusMg / proteinG);
}

export function withDerivedPhosphorusProteinRatio<T extends NutrientTotals>(
  totals: T,
): T {
  const ratio = calculatePhosphorusProteinRatio(totals);

  if (typeof ratio === "number") {
    totals.phosphorus_protein_ratio = ratio;
  } else {
    delete totals.phosphorus_protein_ratio;
  }

  return totals;
}

export function roundNutrient(value: number): number {
  return Math.round(value * 1000) / 1000;
}
