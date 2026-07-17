import {
  buildDefaultTargetStates,
  mapNutritionTargets,
  resolveTargetDefinitionForWeight,
  resolveTargetStateForWeight,
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

describe("mapNutritionTargets", () => {
  it("does not rescale an ordinary calorie target", () => {
    expect(mapNutritionTargets({ caloriesKcal: 2525 })).toEqual({
      caloriesKcal: 2525,
    });
  });

  it("does not multiply a portal daily calorie override by weight", () => {
    expect(
      mapNutritionTargets(
        {
          caloriesKcal: {
            effective: {
              basis: "perKgPerDay",
              high: 2000,
              low: 1800,
              type: "range",
              value: null,
            },
            metric: "caloriesKcal",
          },
        },
        102.5,
      ),
    ).toEqual({ caloriesKcal: 2000 });
  });
});

describe("resolveTargetStateForWeight", () => {
  it("keeps an existing large calorie override as a daily value", () => {
    expect(
      resolveTargetStateForWeight(
        {
          effective: {
            basis: "perKgPerDay",
            high: 2000,
            low: 1800,
            type: "range",
            value: null,
          },
          metric: "caloriesKcal",
        },
        102.5,
      )?.effective,
    ).toEqual({
      basis: "perDay",
      high: 2000,
      low: 1800,
      type: "range",
      value: null,
    });
  });
});
