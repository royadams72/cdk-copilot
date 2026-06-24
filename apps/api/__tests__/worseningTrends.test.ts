import {
  evaluateBloodPressureUpTrend,
  evaluateNutritionWorsening,
  evaluateWeightDecreaseTrend,
  evaluateStepsDeclineTrend,
  evaluateSymptomsWorsening,
  evaluateWeightIncreaseTrend,
} from "../lib/utils/worseningTrends";

describe("worseningTrends", () => {
  it("detects a 30%+ steps decline against the previous 28-day baseline", () => {
    const dailyPoints = [
      ...Array.from({ length: 28 }, (_, index) => ({
        count: 10000,
        dateKey: new Date(Date.UTC(2026, 5, index + 1)).toISOString().slice(0, 10),
      })),
      ...Array.from({ length: 7 }, (_, index) => ({
        count: 6500,
        dateKey: new Date(Date.UTC(2026, 5, index + 29))
          .toISOString()
          .slice(0, 10),
      })),
    ];

    const result = evaluateStepsDeclineTrend({
      dailyPoints,
      now: new Date("2026-07-05T12:00:00.000Z"),
      targetValue: 9000,
    });

    expect(result.triggered).toBe(true);
    expect(result.currentAverage).toBe(6500);
    expect(result.previousAverage).toBe(10000);
    expect(result.declinePct).toBe(35);
  });

  it("does not trigger a steps decline alert when coverage is too sparse", () => {
    const result = evaluateStepsDeclineTrend({
      dailyPoints: [
        { count: 10000, dateKey: "2026-06-01" },
        { count: 10000, dateKey: "2026-06-02" },
        { count: 6500, dateKey: "2026-07-04" },
      ],
      now: new Date("2026-07-05T12:00:00.000Z"),
      targetValue: 9000,
    });

    expect(result.triggered).toBe(false);
    expect(result.currentAverage).toBe(0);
  });

  it("detects a weight increase of 2kg or more across 7 days", () => {
    const result = evaluateWeightIncreaseTrend({
      now: new Date("2026-06-22T12:00:00.000Z"),
      points: [
        {
          dateKey: "2026-06-16",
          measuredAt: "2026-06-16T08:00:00.000Z",
          valueKg: 81.2,
        },
        {
          dateKey: "2026-06-20",
          measuredAt: "2026-06-20T08:00:00.000Z",
          valueKg: 82.7,
        },
        {
          dateKey: "2026-06-22",
          measuredAt: "2026-06-22T08:00:00.000Z",
          valueKg: 83.5,
        },
      ],
    });

    expect(result.triggered).toBe(true);
    expect(result.changeKg).toBe(2.3);
    expect(result.previousWeightKg).toBe(81.2);
    expect(result.currentWeightKg).toBe(83.5);
  });

  it("does not trigger a weight increase alert below threshold", () => {
    const result = evaluateWeightIncreaseTrend({
      now: new Date("2026-06-22T12:00:00.000Z"),
      points: [
        {
          dateKey: "2026-06-16",
          measuredAt: "2026-06-16T08:00:00.000Z",
          valueKg: 81.2,
        },
        {
          dateKey: "2026-06-22",
          measuredAt: "2026-06-22T08:00:00.000Z",
          valueKg: 82.1,
        },
      ],
    });

    expect(result.triggered).toBe(false);
    expect(result.changeKg).toBe(0.9);
  });

  it("detects a weight decrease of 2kg or more across 7 days", () => {
    const result = evaluateWeightDecreaseTrend({
      now: new Date("2026-06-23T12:00:00.000Z"),
      points: [
        {
          dateKey: "2026-06-16",
          measuredAt: "2026-06-16T08:00:00.000Z",
          valueKg: 83.8,
        },
        {
          dateKey: "2026-06-20",
          measuredAt: "2026-06-20T08:00:00.000Z",
          valueKg: 82.1,
        },
        {
          dateKey: "2026-06-23",
          measuredAt: "2026-06-23T08:00:00.000Z",
          valueKg: 81.2,
        },
      ],
    });

    expect(result.triggered).toBe(true);
    expect(result.changeKg).toBe(2.6);
    expect(result.previousWeightKg).toBe(83.8);
    expect(result.currentWeightKg).toBe(81.2);
  });

  it("detects blood pressure rising against the previous 28-day baseline", () => {
    const points = [
      ...Array.from({ length: 28 }, (_, index) => ({
        dateKey: new Date(Date.UTC(2026, 4, index + 19)).toISOString().slice(0, 10),
        diastolicMmHg: 82,
        measuredAt: new Date(Date.UTC(2026, 4, index + 19, 8)).toISOString(),
        systolicMmHg: 126,
      })),
      ...Array.from({ length: 8 }, (_, index) => ({
        dateKey: new Date(Date.UTC(2026, 5, index + 16)).toISOString().slice(0, 10),
        diastolicMmHg: 94,
        measuredAt: new Date(Date.UTC(2026, 5, index + 16, 8)).toISOString(),
        systolicMmHg: 146,
      })),
    ];

    const result = evaluateBloodPressureUpTrend({
      now: new Date("2026-06-23T12:00:00.000Z"),
      points,
      systolicTargetValue: 135,
    });

    expect(result.triggered).toBe(true);
    expect(result.currentAverageSystolic).toBe(146);
    expect(result.previousAverageSystolic).toBe(126);
    expect(result.deltaSystolic).toBe(20);
    expect(result.systolicAboveTargetBy).toBe(11);
  });

  it("detects worsening symptoms from frequent symptom days", () => {
    const result = evaluateSymptomsWorsening({
      entries: [
        { normalizedName: "fatigue", recordedAt: new Date("2026-06-17T08:00:00.000Z"), severity: 2 },
        { normalizedName: "fatigue", recordedAt: new Date("2026-06-18T08:00:00.000Z"), severity: 3 },
        { normalizedName: "nausea", recordedAt: new Date("2026-06-19T08:00:00.000Z"), severity: 2 },
        { normalizedName: "fatigue", recordedAt: new Date("2026-06-21T08:00:00.000Z"), severity: 4 },
      ],
      now: new Date("2026-06-23T12:00:00.000Z"),
    });

    expect(result.triggered).toBe(true);
    expect(result.distinctSymptomDaysRecent).toBe(4);
    expect(result.repeatedSymptomName).toBe("fatigue");
  });

  it("detects nutrition worsening from repeated multi-target breach days", () => {
    const entries = Array.from({ length: 7 }, (_, index) => ({
      eatenAt: new Date(Date.UTC(2026, 5, 17 + index, 12)),
      totals: {
        caloriesKcal: 2200,
        phosphorusMg: 1000,
        potassiumMg: 2500,
        proteinG: 1.1,
        sodiumMg: 2500,
      },
    }));

    const result = evaluateNutritionWorsening({
      entries,
      now: new Date("2026-06-23T12:00:00.000Z"),
      targets: {
        caloriesKcal: 1800,
        phosphorusMg: 800,
        potassiumMg: 2000,
        proteinG: 0.8,
        sodiumMg: 2000,
      },
    });

    expect(result.triggered).toBe(true);
    expect(result.breachDaysRecent).toBe(7);
  });
});
