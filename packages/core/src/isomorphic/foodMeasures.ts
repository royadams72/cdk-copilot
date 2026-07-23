type MeasureLike = {
  label?: string | null;
};

const EGG_LIKE_PATTERN = /\begg(s)?\b/i;
const WHOLE_MEASURE_PATTERN = /\bwhole\b/i;
const EGG_MEASURE_PATTERN = /\begg(s)?\b/i;
const PIECE_MEASURE_PATTERN = /\b(piece|item|unit)\b/i;

export function isEggLikeFoodLabel(value?: string | null) {
  return EGG_LIKE_PATTERN.test((value ?? "").trim());
}

export function getCountMeasurePriority(label?: string | null) {
  const normalized = (label ?? "").trim().toLowerCase();
  if (!normalized) return Number.NEGATIVE_INFINITY;
  if (WHOLE_MEASURE_PATTERN.test(normalized)) return 300;
  if (EGG_MEASURE_PATTERN.test(normalized)) return 250;
  if (PIECE_MEASURE_PATTERN.test(normalized)) return 200;
  if (normalized === "serving") return 100;
  return Number.NEGATIVE_INFINITY;
}

export function findPreferredCountMeasure<T extends MeasureLike>(
  measures: T[],
  foodLabel?: string | null,
) {
  if (!isEggLikeFoodLabel(foodLabel) || !Array.isArray(measures)) {
    return undefined;
  }

  let bestMeasure: T | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const measure of measures) {
    const score = getCountMeasurePriority(measure.label);
    if (score > bestScore) {
      bestScore = score;
      bestMeasure = measure;
    }
  }

  return bestScore > Number.NEGATIVE_INFINITY ? bestMeasure : undefined;
}

export function formatCountMeasureLabelForFood(
  label: string,
  foodLabel?: string | null,
) {
  const normalizedLabel = label.trim().toLowerCase();
  if (normalizedLabel === "whole" && isEggLikeFoodLabel(foodLabel)) {
    return "egg";
  }
  return label;
}
