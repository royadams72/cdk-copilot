import type { MeasurementKind } from "./metricTrendTypes";

export const CHART_WIDTH = 330;
export const CHART_HEIGHT = 210;
export const CHART_PAD = 28;
export const BAR_WIDTH = 12;
export const GROUP_GAP = 4;
export const SLOT_GAP = 16;

export const BP_TARGET_SYSTOLIC = 120;
export const BP_TARGET_DIASTOLIC = 80;
export const SLEEP_TARGET_MIN = 8 * 60;
export const EXERCISE_TARGET_MIN = 30;

export function formatDayLabel(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function formatDateLabel(date: Date) {
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatTimeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function combineDateAndTime(date: Date, time: Date) {
  const value = new Date(date);
  value.setHours(
    time.getHours(),
    time.getMinutes(),
    time.getSeconds(),
    time.getMilliseconds(),
  );
  return value;
}

export function metricUnit(kind: MeasurementKind) {
  if (kind === "steps") return "steps";
  if (kind === "blood_pressure") return "mmHg";
  if (kind === "heart_rate") return "bpm";
  if (kind === "exercise") return "min";
  return "hours";
}

export function addLabel(kind: MeasurementKind) {
  if (kind === "exercise") return "Add exercise";
  if (kind === "sleep") return "Add sleep";
  if (kind === "heart_rate") return "Add heart rate";
  return "Add BP";
}

export function formatMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${m}m`;
}

export function formatYAxisValue(kind: MeasurementKind, value: number) {
  if (kind !== "sleep") return value.toFixed(0);
  const hours = value / 60;
  if (Number.isInteger(hours)) return `${hours}`;
  return hours.toFixed(1);
}

export function dateToMeasuredAtIso(date: Date) {
  const value = new Date(date);
  const hasExplicitTime =
    value.getHours() !== 0 ||
    value.getMinutes() !== 0 ||
    value.getSeconds() !== 0 ||
    value.getMilliseconds() !== 0;

  if (!hasExplicitTime) {
    const now = new Date();
    value.setHours(
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds(),
    );
  }

  return value.toISOString();
}

export function numberRange(min: number, max: number) {
  return Array.from({ length: max - min + 1 }, (_, idx) => min + idx);
}
