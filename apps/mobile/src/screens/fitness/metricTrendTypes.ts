export type {
  ExerciseRefCategory,
  ExerciseRefItem,
  MeasurementDayEntry as DayEntry,
  MeasurementKind,
  MeasurementTrendPoint as TrendPoint,
} from "@/store/services/types";

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
