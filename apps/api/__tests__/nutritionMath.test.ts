import {
  calculatePhosphorusProteinRatio,
  withDerivedPhosphorusProteinRatio,
} from "../lib/utils/nutritionMath";

describe("nutritionMath", () => {
  it("derives phosphorus/protein ratio from summed totals", () => {
    expect(
      withDerivedPhosphorusProteinRatio({
        caloriesKcal: 300,
        phosphorusMg: 180,
        potassiumMg: 0,
        proteinG: 20,
        sodiumMg: 0,
      }),
    ).toEqual({
      caloriesKcal: 300,
      phosphorusMg: 180,
      potassiumMg: 0,
      phosphorus_protein_ratio: 9,
      proteinG: 20,
      sodiumMg: 0,
    });
  });

  it("returns undefined when protein is missing or zero", () => {
    expect(
      calculatePhosphorusProteinRatio({ phosphorusMg: 180, proteinG: 0 }),
    ).toBeUndefined();
    expect(
      calculatePhosphorusProteinRatio({ phosphorusMg: 180, proteinG: undefined }),
    ).toBeUndefined();
  });
});
