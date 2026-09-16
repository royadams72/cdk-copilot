import {
  buildDefaultTargetStates,
  mapNutritionTargets,
  resolveTargetDefinitionForWeight,
  resolveTargetStateForWeight,
  resolveTargetValue,
} from "./targets";
import { TargetMetricState } from "@ckd/core";
import { readFileSync } from "fs";
import { resolve } from "path";

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
      careTeamTarget: null,
      derivedFrom: {
        matchedAt: now,
        ruleId: "steps-per-day-adults-under-60",
        version: 1,
      },
      domain: "lifestyle",
      effective: null,
      generalReferenceSelected: false,
      metric: "steps_per_day",
      override: null,
      personalGoal: null,
      recommended: { basis: "perDay", type: "min", value: 8000 },
      unit: "steps/day",
    });

    expect(targets.caloriesKcal).toMatchObject({
      domain: "renal",
      effective: null,
      generalReferenceSelected: false,
      metric: "caloriesKcal",
      unit: "kcal/day",
    });
    expect(TargetMetricState.safeParse(targets.steps_per_day).success).toBe(true);
    expect(mapNutritionTargets(targets, 80)).toEqual({});
  });
});

describe("Mongo target validators", () => {
  it("permits every seeded target field and nullable removal values", () => {
    const current = JSON.parse(readFileSync(
      resolve(__dirname, "../../../../scripts/mongo-validators/targets_current.json"),
      "utf8",
    ));
    const ledger = JSON.parse(readFileSync(
      resolve(__dirname, "../../../../scripts/mongo-validators/targets_ledger.json"),
      "utf8",
    ));
    const fields = current.validator.$jsonSchema.properties.targets.additionalProperties.properties;
    const state = buildDefaultTargetStates().steps_per_day;
    expect(Object.keys(state).filter((key) => !(key in fields))).toEqual([]);
    expect(fields.effective.bsonType).toContain("null");
    expect(fields.personalGoal.bsonType).toContain("null");
    expect(fields.careTeamTarget.bsonType).toContain("null");
    expect(ledger.validator.$jsonSchema.properties.after.bsonType).toContain("null");
  });
});

describe("target priority", () => {
  it("uses the care-team target without deleting the separate personal goal", () => {
    expect(resolveTargetValue({
      careTeamTarget: { type: "max", value: 1700 },
      effective: { type: "max", value: 1700 },
      generalReferenceSelected: false,
      personalGoal: { type: "max", value: 1900 },
      recommended: { type: "max", value: 2000 },
    }, null)).toBe(1700);
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
  it("omits unset metrics while retaining explicitly active metrics", () => {
    expect(mapNutritionTargets({
      phosphorusMg: {
        effective: null,
        generalReferenceSelected: false,
        recommended: { type: "max", value: 800 },
      },
      sodiumMg: {
        effective: { type: "max", value: 1800 },
        generalReferenceSelected: false,
        personalGoal: { type: "max", value: 1800 },
      },
    })).toEqual({ sodiumMg: 1800 });
  });

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
  it("maps legacy patient and clinician overrides into separate target roles", () => {
    const personalGoal = { basis: "perDay" as const, type: "max" as const, value: 2100 };
    const careTeamTarget = { basis: "perDay" as const, type: "max" as const, value: 1900 };

    expect(
      resolveTargetStateForWeight(
        {
          effective: personalGoal,
          metric: "sodiumMg",
          override: personalGoal,
          overrideMeta: { setBy: { actorType: "user" } },
        },
        null,
      )?.personalGoal,
    ).toEqual(personalGoal);

    expect(
      resolveTargetStateForWeight(
        {
          effective: careTeamTarget,
          metric: "sodiumMg",
          override: careTeamTarget,
          overrideMeta: { setBy: { actorType: "clinician" } },
        },
        null,
      )?.careTeamTarget,
    ).toEqual(careTeamTarget);
  });

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
