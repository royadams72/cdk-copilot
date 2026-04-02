import type { TQueryKind } from "@ckd/core";
import type { NormalizedFoodQuery } from "./normalizeFoodQuery";
import type { ScoredOpenFoodFactsCandidate } from "./scoreOpenFoodFactsResults";

export function selectBestOpenFoodFactsResult(
  query: NormalizedFoodQuery,
  queryKind: TQueryKind,
  ranked: ScoredOpenFoodFactsCandidate[],
) {
  const sorted = [...ranked].sort((left, right) => right.score - left.score);
  const best = sorted[0] ?? null;
  const second = sorted[1] ?? null;
  if (!best) {
    return {
      alternatives: [],
      ambiguityFlags: ["off_no_results"],
      best: null,
      goodEnough: false,
    };
  }

  const ambiguityFlags = new Set<string>(best.flags);
  const minimumScore = getMinimumScore(queryKind, query.hasCookedHint);
  const gap = second ? best.score - second.score : best.score;

  if (gap < 8 && sorted.length > 1) ambiguityFlags.add("off_ambiguous");
  if (queryKind === "generic" && query.tokens.length <= 1 && sorted.length > 1 && gap < 20) {
    ambiguityFlags.add("off_ambiguous");
  }
  if (best.score < minimumScore) ambiguityFlags.add("off_score_too_low");
  if (best.flags.includes("cooked_state_mismatch")) ambiguityFlags.add("off_cooked_mismatch");
  if (queryKind === "meal_like") ambiguityFlags.add("multiple_foods_detected");

  return {
    alternatives: sorted.slice(1, 6),
    ambiguityFlags: [...ambiguityFlags],
    best,
    goodEnough:
      best.score >= minimumScore &&
      !ambiguityFlags.has("off_ambiguous") &&
      !ambiguityFlags.has("off_cooked_mismatch") &&
      queryKind !== "meal_like",
  };
}

function getMinimumScore(queryKind: TQueryKind, hasCookedHint: boolean) {
  if (queryKind === "branded" || queryKind === "mixed") return 58;
  if (queryKind === "generic" && hasCookedHint) return 68;
  if (queryKind === "generic") return 62;
  return 70;
}
