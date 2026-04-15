export type MeasurementKind =
  | "steps"
  | "exercise"
  | "sleep"
  | "blood_pressure"
  | "heart_rate";

export type TrendPoint = {
  date: string;
  measuredAt: string;
  value: number | null;
  value2: number | null;
};

export type DayEntry = {
  exerciseId?: string;
  exerciseName?: string;
  exerciseTitle?: string;
  measuredAt: string;
  sleepFromAt?: string;
  sleepToAt?: string;
  value: number | null;
  value2: number | null;
};

export type ChartPoint = {
  barX: number;
  date: string;
  hasValue: boolean;
  label: string;
  value: number | null;
  x: number;
  y: number;
  y2?: number;
};

export type ExerciseRefItem = {
  category: string;
  exerciseId: string;
  intensity: "light" | "moderate" | "vigorous";
  met: number;
  name: string;
};

export type ExerciseRefCategory = {
  category: string;
  items: ExerciseRefItem[];
};
