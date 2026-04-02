import type {
  TCofidNutrientProfile,
  TOpenFoodFactsCandidate,
  TQueryKind,
  TResolvedFoodCandidate,
  TResolvedFoodResult,
  TResolutionConfidence,
  TResolutionPath,
} from "@ckd/core";
import { mergeNutrients } from "./mergeNutrients";
import type { ScoredOpenFoodFactsCandidate } from "./scoreOpenFoodFactsResults";

type BuildFoodResolutionResultInput = {
  ambiguityFlags: string[];
  alternatives: Array<TResolvedFoodCandidate>;
  cofid?: TCofidNutrientProfile | null;
  normalizedQuery: string;
  offSelection?: ScoredOpenFoodFactsCandidate | null;
  query: string;
  queryKind: TQueryKind;
  resolutionNotes?: string[];
  resolutionPath: TResolutionPath;
};

export function buildFoodResolutionResult(
  input: BuildFoodResolutionResultInput,
): TResolvedFoodResult {
  const selected = input.resolutionPath === "cofid_generic" && input.cofid
    ? buildCofidCandidate(input.cofid, 70)
    : input.offSelection
      ? buildOffCandidate(
          input.offSelection,
          input.resolutionPath === "off_plus_cofid" ? "merged" : "open_food_facts",
        )
      : input.cofid
        ? buildCofidCandidate(input.cofid, 60)
        : input.alternatives[0] ?? buildPlaceholderCandidate(input);

  const merged = mergeNutrients({
    cofid: input.resolutionPath === "off_only" ? undefined : input.cofid?.nutrientsPer100g,
    off: input.offSelection?.candidate.nutrientsPer100g ?? {},
  });

  const confidence = resolveConfidence(
    input.resolutionPath,
    input.offSelection?.score,
    input.ambiguityFlags,
  );

  return {
    alternatives: input.alternatives,
    ambiguityFlags: input.ambiguityFlags,
    confidence,
    normalizedQuery: input.normalizedQuery,
    nutrients: input.resolutionPath === "cofid_generic" && input.cofid
      ? input.cofid.nutrientsPer100g
      : merged.nutrients,
    provenance:
      input.resolutionPath === "cofid_generic" && input.cofid
        ? mergeNutrients({ off: {}, cofid: input.cofid.nutrientsPer100g }).provenance
        : merged.provenance,
    query: input.query,
    queryKind: input.queryKind,
    resolutionPath: input.resolutionPath,
    selectedResult: {
      ...selected,
      estimated: input.resolutionPath !== "off_only",
      offBarcode: input.offSelection?.candidate.barcode,
      resolutionNotes: input.resolutionNotes ?? [],
    },
  };
}

function buildOffCandidate(
  candidate: ScoredOpenFoodFactsCandidate,
  source: TResolvedFoodCandidate["source"],
): TResolvedFoodCandidate {
  return {
    barcode: candidate.candidate.barcode,
    brand: candidate.candidate.brand,
    displayName: [candidate.candidate.brand, candidate.candidate.productName]
      .filter(Boolean)
      .join(" ")
      .trim(),
    matchScore: candidate.score,
    normalizedName: candidate.candidate.normalizedName,
    nutrientsPer100g: candidate.candidate.nutrientsPer100g,
    source,
  };
}

function buildCofidCandidate(candidate: TCofidNutrientProfile, score: number): TResolvedFoodCandidate {
  return {
    displayName: candidate.foodName,
    matchScore: score,
    normalizedName: candidate.normalizedName,
    nutrientsPer100g: candidate.nutrientsPer100g,
    source: "cofid",
  };
}

function resolveConfidence(
  path: TResolutionPath,
  offScore: number | undefined,
  ambiguityFlags: string[],
): TResolutionConfidence {
  if (path === "cofid_generic") return ambiguityFlags.length > 0 ? "medium" : "high";
  if ((offScore ?? 0) >= 75 && ambiguityFlags.length === 0) return "high";
  if ((offScore ?? 0) >= 60) return "medium";
  return "low";
}

function buildPlaceholderCandidate(
  input: Pick<BuildFoodResolutionResultInput, "normalizedQuery" | "query" | "resolutionPath">,
): TResolvedFoodCandidate {
  return {
    displayName: input.query,
    matchScore: 0,
    normalizedName: input.normalizedQuery,
    nutrientsPer100g: {},
    source: input.resolutionPath === "off_only" ? "open_food_facts" : "cofid",
  };
}
