import {
  buildDefaultTargetStates,
  resolveTargetDefinitionForWeight,
} from "./targets";

describe("buildDefaultTargetStates", () => {
  it("builds editable default renal and lifestyle targets", () => {
    const now = new Date("2026-06-10T12:00:00.000Z");
    const targets = buildDefaultTargetStates(now);

    expect(Object.keys(targets).sort()).toEqual([
      "caloriesKcal",
      "phosphorusMg",
      "potassiumMg",
      "proteinG",
      "sleep_duration_min_day",
      "sodiumMg",
      "steps_per_day",
      "weight_kg",
    ]);

    expect(targets.steps_per_day).toMatchObject({
      derivedFrom: {
        matchedAt: now,
        ruleId: "steps-per-day-adults-under-60",
        version: 1,
      },
      domain: "lifestyle",
      effective: { basis: "perDay", type: "min", value: 8000 },
      metric: "steps_per_day",
      override: null,
      recommended: { basis: "perDay", type: "min", value: 8000 },
      unit: "steps/day",
    });

    expect(targets.caloriesKcal).toMatchObject({
      domain: "renal",
      effective: {
        basis: "perKgPerDay",
        high: 35,
        low: 25,
        type: "range",
        value: null,
      },
      metric: "caloriesKcal",
      unit: "kcal/day",
    });
  });
});

describe("resolveTargetDefinitionForWeight", () => {
  it("converts per-kg defaults into daily amounts", () => {
    expect(
      resolveTargetDefinitionForWeight(
        { basis: "perKgPerDay", high: 35, low: 25, type: "range", value: null },
        80,
      ),
    ).toEqual({
      basis: "perDay",
      high: 2800,
      low: 2000,
      type: "range",
      value: null,
    });

    expect(
      resolveTargetDefinitionForWeight(
        { basis: "perKgPerDay", type: "max", value: 0.8 },
        80,
      ),
    ).toEqual({
      basis: "perDay",
      high: null,
      low: null,
      type: "max",
      value: 64,
    });
  });
});
