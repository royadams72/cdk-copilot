import type { TFoodSearchInput } from "@ckd/core";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "fresh",
  "had",
  "i",
  "in",
  "my",
  "of",
  "some",
  "the",
  "with",
]);

export type NormalizedFoodQuery = {
  canonicalText: string;
  compactText: string;
  hasCookedHint: boolean;
  hasGenericPackagedHint: boolean;
  hasMealJoiner: boolean;
  query: string;
  rawTokens: string[];
  searchVariants: string[];
  searchText: string;
  tokens: string[];
};

export function normalizeFoodQuery(input: TFoodSearchInput): NormalizedFoodQuery {
  const base = input.normalizedText || input.query;
  const compactText = stripLeadingAmountPhrase(
    base
      .toLowerCase()
      .replace(/[%/(),]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
  const searchVariants = buildSearchVariants(compactText);
  const canonicalText = searchVariants[0] ?? compactText;

  const rawTokens = canonicalText
    .split(" ")
    .map((token: string) => token.trim())
    .filter(Boolean);
  const tokens = rawTokens.filter((token: string) => !STOP_WORDS.has(token));
  const hasCookedHint =
    /\b(cooked|boiled|fried|grilled|roasted|steamed|baked|microwave|microwavable|ready|pouch)\b/.test(
      compactText,
    ) || input.hints?.preparation?.toLowerCase() === "cooked";
  const hasGenericPackagedHint =
    /\b(burger|nuggets|pizza|soup|sauce|pouch|ready meal|microwave|can|jar)\b/.test(
      compactText,
    );
  const hasMealJoiner = /\b(with|and)\b/.test(compactText);

  return {
    canonicalText,
    compactText,
    hasCookedHint,
    hasGenericPackagedHint,
    hasMealJoiner,
    query: input.query.trim(),
    rawTokens,
    searchText: tokens.join(" ").trim() || canonicalText,
    searchVariants,
    tokens,
  };
}

function buildSearchVariants(compactText: string) {
  const variants = new Set<string>();
  const rewritten = applyUkGenericSynonyms(compactText);

  variants.add(rewritten);
  variants.add(compactText);

  if (/\bbrown bread\b/.test(compactText)) {
    variants.add(compactText.replace(/\bbrown bread\b/g, "wholemeal bread"));
    variants.add(compactText.replace(/\bbrown bread\b/g, "whole wheat bread"));
  }

  if (/\bwhole wheat bread\b/.test(compactText)) {
    variants.add(compactText.replace(/\bwhole wheat bread\b/g, "wholemeal bread"));
  }

  if (/\bgranary bread\b/.test(compactText)) {
    variants.add(compactText.replace(/\bgranary bread\b/g, "wholemeal bread"));
  }

  return [...variants].filter(Boolean);
}

function applyUkGenericSynonyms(compactText: string) {
  return compactText
    .replace(/\bbrown bread\b/g, "wholemeal bread")
    .replace(/\bwhole grain bread\b/g, "wholemeal bread")
    .replace(/\bwholegrain bread\b/g, "wholemeal bread")
    .replace(/\bwhole wheat bread\b/g, "wholemeal bread")
    .replace(/\bgranary bread\b/g, "wholemeal bread")
    .replace(/\bbrown rice\b/g, "wholegrain rice")
    .replace(/\bsemi[- ]skimmed milk\b/g, "semi skimmed milk")
    .replace(/\bskim milk\b/g, "skimmed milk")
    .replace(/\bfull[- ]fat milk\b/g, "whole milk")
    .replace(/\bwithout salt\b/g, "unsalted")
    .replace(/\bno added salt\b/g, "unsalted")
    .replace(/\blow salt\b/g, "reduced salt")
    .replace(/\bin spring water\b/g, "in water");
}

function stripLeadingAmountPhrase(text: string) {
  return text
    .replace(
      /^(?:about\s+|approx(?:imately)?\s+)?\d+(?:\.\d+)?\s*(?:g|gram|grams|kg|ml|l|oz|lb|lbs|slice|slices|piece|pieces|serving|servings|cup|cups|tbsp|tsp)\b(?:\s+of)?\s+/,
      "",
    )
    .replace(/^(?:a|an|some)\s+/i, "")
    .trim();
}
