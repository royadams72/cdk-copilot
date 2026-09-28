import {
  estimateActivityCalories,
  isStepBasedExercise,
} from "@/lib/activityCalories";
import type { MeasurementDayEntry } from "@/store/services/types";

function exerciseEntry(
  overrides: Partial<MeasurementDayEntry>,
): MeasurementDayEntry {
  return {
    canDelete: false,
    canEdit: false,
    entryId: "exercise-1",
    measuredAt: "2026-09-28T12:00:00.000Z",
    value: null,
    value2: 30,
    ...overrides,
  };
}

describe("activity calorie estimates", () => {
  it("uses distance and weight for walking calories", () => {
    expect(
      estimateActivityCalories({
        distanceMeters: 5_000,
        exerciseEntries: [],
        steps: 7_000,
        weightKg: 80,
      }),
    ).toEqual({ exerciseKcal: 0, stepKcal: 200, totalKcal: 200 });
  });

  it("falls back to estimated distance when distance is unavailable", () => {
    expect(
      estimateActivityCalories({
        exerciseEntries: [],
        steps: 10_000,
        weightKg: 70,
      }).stepKcal,
    ).toBe(267);
  });

  it("adds non-step exercise and excludes step-based workouts", () => {
    const cycling = exerciseEntry({
      exerciseTitle: "Cycling",
      value: 240,
    });
    const walking = exerciseEntry({
      exerciseTitle: "Outdoor walking",
      value: 180,
    });

    expect(isStepBasedExercise(walking)).toBe(true);
    expect(
      estimateActivityCalories({
        distanceMeters: 4_000,
        exerciseEntries: [cycling, walking],
        weightKg: 70,
      }),
    ).toEqual({ exerciseKcal: 240, stepKcal: 140, totalKcal: 380 });
  });

  it("estimates non-step workouts whose provider reports zero calories", () => {
    expect(
      estimateActivityCalories({
        distanceMeters: 0,
        exerciseEntries: [
          exerciseEntry({ exerciseTitle: "Strength training", value: 0 }),
        ],
        weightKg: 75,
      }).exerciseKcal,
    ).toBe(150);
  });
});
