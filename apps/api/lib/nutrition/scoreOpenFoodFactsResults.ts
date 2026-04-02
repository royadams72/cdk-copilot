import type {
  TOpenFoodFactsCandidate,
  TQueryKind,
} from "@ckd/core";
import type { NormalizedFoodQuery } from "./normalizeFoodQuery";

export type ScoredOpenFoodFactsCandidate = {
  candidate: TOpenFoodFactsCandidate;
  flags: string[];
  score: number;
};

const FLAVOUR_TERMS = /\b(curry|flavou?r|spicy|seasoned|bbq|barbecue|peri peri|sweet chilli|garlic|herb)\b/i;
const PLAIN_TERMS = /\b(plain|unsalted|unseasoned|natural)\b/i;
const LOW_QUALITY_TERMS = /\b(test|unknown|misc|barcode|item)\b/i;
const PACKAGED_TERMS = /\b(pack|pouch|microwave|frozen|burger|nuggets|soup|sauce|ready meal)\b/i;

export function scoreOpenFoodFactsResults(
  query: NormalizedFoodQuery,
  queryKind: TQueryKind,
  candidates: TOpenFoodFactsCandidate[],
): ScoredOpenFoodFactsCandidate[] {
  return candidates.map((candidate) => {
    const haystack = [
      candidate.productName,
      candidate.brand ?? "",
      candidate.normalizedName,
      candidate.categories.join(" "),
    ]
      .join(" ")
      .toLowerCase();
    const tokenHits = query.tokens.filter((token) => haystack.includes(token)).length;
    const tokenCoverage = query.tokens.length ? tokenHits / query.tokens.length : 0;
    const exactQueryMatch = haystack.includes(query.searchText) ? 22 : 0;
    const brandMatch =
      candidate.brand && query.query.toLowerCase().includes(candidate.brand.toLowerCase())
        ? 24
        : 0;
    const ukBonus = candidate.ukMarketMatch ? 14 : 0;
    const packagedBonus =
      PACKAGED_TERMS.test(haystack) || Boolean(candidate.brand) || candidate.barcode ? 12 : 0;
    const plainBonus =
      queryKind === "generic" && !query.hasCookedHint && PLAIN_TERMS.test(haystack) ? 10 : 0;
    const flavouredPenalty =
      queryKind === "generic" && !query.hasCookedHint && FLAVOUR_TERMS.test(haystack) ? 18 : 0;
    const cookedPenalty =
      !query.hasCookedHint && /\bcooked\b/i.test(haystack) && /\brace\b/i.test(query.searchText)
        ? 10
        : 0;
    const completeness = nutrientCompletenessScore(candidate);
    const lowQualityPenalty =
      LOW_QUALITY_TERMS.test(haystack) || candidate.nutrimentsQualityWarnings.length > 0 ? 12 : 0;
    const missingNamePenalty = candidate.productName.trim().length < 4 ? 18 : 0;

    const score = Math.round(
      tokenCoverage * 50 +
        exactQueryMatch +
        brandMatch +
        ukBonus +
        packagedBonus +
        plainBonus +
        completeness -
        flavouredPenalty -
        cookedPenalty -
        lowQualityPenalty -
        missingNamePenalty,
    );

    const flags = [
      ...(candidate.ukMarketMatch ? [] : ["not_uk_weighted"]),
      ...(flavouredPenalty > 0 ? ["flavoured_variant"] : []),
      ...(cookedPenalty > 0 ? ["cooked_state_mismatch"] : []),
      ...(completeness < 14 ? ["incomplete_nutrients"] : []),
      ...(lowQualityPenalty > 0 ? ["low_quality_listing"] : []),
    ];

    return { candidate, flags, score };
  });
}

function nutrientCompletenessScore(candidate: TOpenFoodFactsCandidate) {
  const nutrients = candidate.nutrientsPer100g;
  const present = [
    nutrients.caloriesKcal,
    nutrients.carbsG,
    nutrients.fatG,
    nutrients.proteinG,
    nutrients.sodiumMg,
    nutrients.potassiumMg,
    nutrients.phosphorusMg,
  ].filter((value) => typeof value === "number").length;

  return present * 4;
}
