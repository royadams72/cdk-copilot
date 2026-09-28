import type { MeasurementDayEntry } from "@/store/services/types";

const DEFAULT_STEP_LENGTH_METERS = 0.762;
const WALKING_KCAL_PER_KG_KM = 0.5;
const RUNNING_KCAL_PER_KG_KM = 1;
const RUNNING_SPEED_KPH = 6.5;
const DEFAULT_NON_STEP_MET = 4;

const STEP_BASED_EXERCISE =
  /\b(walk|walking|run|running|jog|jogging|hike|hiking|treadmill|stairs?|step)\b/i;

export type ActivityCaloriesEstimate = {
  exerciseKcal: number;
  stepKcal: number;
  totalKcal: number;
};

function exerciseLabel(entry: MeasurementDayEntry) {
  return [entry.exerciseTitle, entry.exerciseName, entry.exerciseId]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

export function isStepBasedExercise(entry: MeasurementDayEntry) {
  return STEP_BASED_EXERCISE.test(exerciseLabel(entry));
}

export function estimateActivityCalories({
  averageSpeedKph,
  distanceMeters,
  exerciseEntries,
  steps,
  weightKg,
}: {
  averageSpeedKph?: number | null;
  distanceMeters?: number | null;
  exerciseEntries: MeasurementDayEntry[];
  steps?: number | null;
  weightKg: number;
}): ActivityCaloriesEstimate {
  const resolvedDistanceMeters =
    typeof distanceMeters === "number" && distanceMeters > 0
      ? distanceMeters
      : Math.max(0, steps ?? 0) * DEFAULT_STEP_LENGTH_METERS;
  const kcalPerKgKm =
    typeof averageSpeedKph === "number" && averageSpeedKph >= RUNNING_SPEED_KPH
      ? RUNNING_KCAL_PER_KG_KM
      : WALKING_KCAL_PER_KG_KM;
  const stepKcal = (resolvedDistanceMeters / 1000) * weightKg * kcalPerKgKm;

  const exerciseKcal = exerciseEntries.reduce((total, entry) => {
    if (isStepBasedExercise(entry)) return total;

    const reportedKcal = entry.value;
    if (
      typeof reportedKcal === "number" &&
      Number.isFinite(reportedKcal) &&
      reportedKcal > 0
    ) {
      return total + reportedKcal;
    }

    const durationMin = entry.value2;
    if (
      typeof durationMin !== "number" ||
      !Number.isFinite(durationMin) ||
      durationMin <= 0
    ) {
      return total;
    }

    return total + DEFAULT_NON_STEP_MET * weightKg * (durationMin / 60);
  }, 0);

  return {
    exerciseKcal: Math.round(exerciseKcal),
    stepKcal: Math.round(stepKcal),
    totalKcal: Math.round(stepKcal + exerciseKcal),
  };
}
