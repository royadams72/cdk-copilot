import type {
  TFoodSearchInput,
  TResolvedFoodCandidate,
  TResolvedFoodResult,
} from "@ckd/core";
import { buildFoodResolutionResult } from "./buildFoodResolutionResult";
import { classifyFoodQuery } from "./classifyFoodQuery";
import { enrichWithCofid } from "./enrichWithCofid";
import { normalizeFoodQuery } from "./normalizeFoodQuery";
import { resolveGenericFood } from "./resolveGenericFood";
import { scoreOpenFoodFactsResults } from "./scoreOpenFoodFactsResults";
import { searchOpenFoodFacts } from "./searchOpenFoodFacts";
import { selectBestOpenFoodFactsResult } from "./selectBestOpenFoodFactsResult";

export type SearchFoodDependencies = {
  cofidEnricher?: typeof enrichWithCofid;
  genericResolver?: typeof resolveGenericFood;
  offSearch?: typeof searchOpenFoodFacts;
};

export async function searchFood(
  input: TFoodSearchInput,
  dependencies: SearchFoodDependencies = {},
): Promise<TResolvedFoodResult> {
  const normalized = normalizeFoodQuery(input);
  const queryKind = classifyFoodQuery(input, normalized);
  const offSearch = dependencies.offSearch ?? searchOpenFoodFacts;
  const genericResolver = dependencies.genericResolver ?? resolveGenericFood;
  const cofidEnricher = dependencies.cofidEnricher ?? enrichWithCofid;

  try {
    const offCandidates = await searchOffAcrossVariants(offSearch, normalized.searchVariants);
    const scored = scoreOpenFoodFactsResults(normalized, queryKind, offCandidates);
    const selection = selectBestOpenFoodFactsResult(normalized, queryKind, scored);
    const generic = await genericResolver(input, normalized);

    if (selection.goodEnough && selection.best) {
      const enrichment = needsCofidEnrichment(selection.best.candidate)
        ? await cofidEnricher(selection.best.candidate, generic.selected)
        : null;
      return buildFoodResolutionResult({
        ambiguityFlags: selection.ambiguityFlags,
        alternatives: buildAlternatives(selection.alternatives, generic.alternatives),
        cofid: enrichment,
        normalizedQuery: normalized.compactText,
        offSelection: selection.best,
        query: input.query,
        queryKind,
        resolutionNotes:
          enrichment
            ? ["Open Food Facts match selected and CoFID filled missing nutrients."]
            : ["Open Food Facts match selected without CoFID enrichment."],
        resolutionPath: enrichment ? "off_plus_cofid" : "off_only",
      });
    }

    return buildFoodResolutionResult({
      ambiguityFlags: [...new Set([...selection.ambiguityFlags, "generic_fallback"])],
      alternatives: buildAlternatives(selection.alternatives, generic.alternatives),
      cofid: generic.selected,
      normalizedQuery: normalized.compactText,
      query: input.query,
      queryKind,
      resolutionNotes: ["CoFID generic reference selected because OFF was not decisive enough."],
      resolutionPath: "cofid_generic",
    });
  } catch (error) {
    const generic = await genericResolver(input, normalized);
    return buildFoodResolutionResult({
      ambiguityFlags: ["off_unavailable"],
      alternatives: generic.alternatives.map((candidate, index) => ({
        displayName: candidate.foodName,
        matchScore: 50 - index,
        normalizedName: candidate.normalizedName,
        nutrientsPer100g: candidate.nutrientsPer100g,
        source: "cofid",
      })),
      cofid: generic.selected,
      normalizedQuery: normalized.compactText,
      query: input.query,
      queryKind,
      resolutionNotes: [
        error instanceof Error
          ? `OFF unavailable: ${error.message}`
          : "OFF unavailable; returned CoFID generic reference.",
      ],
      resolutionPath: "cofid_generic",
    });
  }
}

async function searchOffAcrossVariants(
  offSearch: (query: string) => ReturnType<typeof searchOpenFoodFacts>,
  variants: string[],
) {
  const seen = new Map<string, Awaited<ReturnType<typeof searchOpenFoodFacts>>[number]>();

  for (const variant of variants) {
    const results = await offSearch(variant);
    for (const result of results) {
      const key = result.barcode ?? `${result.brand ?? ""}:${result.normalizedName}`;
      if (!seen.has(key)) {
        seen.set(key, result);
      }
    }
    if (seen.size > 0) {
      break;
    }
  }

  return [...seen.values()];
}

function needsCofidEnrichment(candidate: { nutrientsPer100g: Record<string, number | undefined> }) {
  return (
    candidate.nutrientsPer100g.potassiumMg === undefined ||
    candidate.nutrientsPer100g.phosphorusMg === undefined
  );
}

function buildAlternatives(
  offAlternatives: Array<{ candidate: { barcode: string | null; brand: string | null; normalizedName: string; nutrientsPer100g: Record<string, number | undefined>; productName: string }; score: number }>,
  cofidAlternatives: Array<{ foodName: string; normalizedName: string; nutrientsPer100g: Record<string, number | undefined> }>,
): TResolvedFoodCandidate[] {
  return [
    ...offAlternatives.map((entry) => ({
      barcode: entry.candidate.barcode,
      brand: entry.candidate.brand,
      displayName: [entry.candidate.brand, entry.candidate.productName].filter(Boolean).join(" "),
      matchScore: entry.score,
      normalizedName: entry.candidate.normalizedName,
      nutrientsPer100g: entry.candidate.nutrientsPer100g,
      source: "open_food_facts" as const,
    })),
    ...cofidAlternatives.slice(0, 2).map((entry, index) => ({
      displayName: entry.foodName,
      matchScore: 49 - index,
      normalizedName: entry.normalizedName,
      nutrientsPer100g: entry.nutrientsPer100g,
      source: "cofid" as const,
    })),
  ].slice(0, 6);
}
