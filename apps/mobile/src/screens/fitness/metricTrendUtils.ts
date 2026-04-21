import type { DayEntry, MeasurementKind } from "./metricTrendTypes";

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
  if (kind === "weight") return "kg";
  return "hours";
}

export function addLabel(kind: MeasurementKind) {
  if (kind === "exercise") return "Add exercise";
  if (kind === "sleep") return "Add sleep";
  if (kind === "weight") return "Add weight";
  if (kind === "heart_rate") return "Add heart rate";
  return "Add BP";
}

export function formatSleepHours(total: number | null) {
  if (typeof total !== "number" || !Number.isFinite(total)) return "--";
  const hours = Math.round((total / 60) * 10) / 10;
  return `${Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1)} h`;
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

export function sortEntriesForTrendDay(
  kind: MeasurementKind,
  entries: DayEntry[],
) {
  const sorted = entries
    .slice()
    .sort((a, b) =>
      a.measuredAt === b.measuredAt ? 0 : a.measuredAt < b.measuredAt ? 1 : -1,
    );

  if (kind !== "steps") {
    return sorted;
  }

  const preferred =
    sorted.find(
      (entry) =>
        typeof entry.distanceMeters === "number" ||
        typeof entry.caloriesKcal === "number" ||
        typeof entry.averageSpeedKph === "number",
    ) ?? sorted[0];

  return preferred ? [preferred] : [];
}

export function getStepSummaryFromEntries(entries: DayEntry[]) {
  const preferred =
    entries.find(
      (entry) =>
        typeof entry.distanceMeters === "number" ||
        typeof entry.caloriesKcal === "number" ||
        typeof entry.averageSpeedKph === "number",
    ) ?? entries[0];

  return {
    averageSpeedKph: preferred?.averageSpeedKph ?? null,
    caloriesKcal: preferred?.caloriesKcal ?? null,
    distanceMeters: preferred?.distanceMeters ?? null,
    steps:
      typeof preferred?.value === "number" && Number.isFinite(preferred.value)
        ? preferred.value
        : null,
  };
}

export function formatDistanceValue(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} km`;
  }
  return `${Math.round(value)} m`;
}

export function formatStepMetric(
  value: number | null,
  options?: { digits?: number; suffix?: string },
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  const digits = options?.digits ?? 0;
  const rounded =
    digits > 0 ? value.toFixed(digits) : Math.round(value).toLocaleString();
  return options?.suffix ? `${rounded} ${options.suffix}` : rounded;
}
