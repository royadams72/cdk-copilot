import type { TFoodSearchInput, TQueryKind } from "@ckd/core";
import type { NormalizedFoodQuery } from "./normalizeFoodQuery";

const GENERIC_FOODS = new Set([
  "apple",
  "basmati",
  "beans",
  "bread",
  "burger",
  "curry",
  "chicken",
  "milk",
  "pasta",
  "potato",
  "potatoes",
  "rice",
  "salad",
  "soup",
  "yogurt",
]);

const BRAND_PATTERNS = [
  /\bbirds?\s+eye\b/i,
  /\btesco\b/i,
  /\basda\b/i,
  /\bsainsbury'?s\b/i,
  /\bmorrisons\b/i,
  /\bwaitrose\b/i,
  /\bmarks?\s*&\s*spencer\b/i,
  /\bm&s\b/i,
];

export function classifyFoodQuery(
  input: TFoodSearchInput,
  normalized: NormalizedFoodQuery,
): TQueryKind {
  const raw = input.query.trim();
  const lowerRaw = raw.toLowerCase();
  const hasBrandHint =
    Boolean(input.hints?.brand) ||
    BRAND_PATTERNS.some((pattern) => pattern.test(raw)) ||
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/.test(raw);
  const hasMealLikeJoiner =
    normalized.hasMealJoiner &&
    /( with | and )/.test(` ${lowerRaw} `) &&
    normalized.tokens.length >= 3;
  const hasGenericTerm = normalized.tokens.some((token) =>
    GENERIC_FOODS.has(token),
  );

  if (hasMealLikeJoiner) return "meal_like";
  if (hasBrandHint && (hasGenericTerm || normalized.hasGenericPackagedHint)) {
    return "mixed";
  }
  if (hasBrandHint) return "branded";
  if (hasGenericTerm || normalized.hasCookedHint) return "generic";
  return normalized.tokens.length > 0 ? "unknown" : "generic";
}
