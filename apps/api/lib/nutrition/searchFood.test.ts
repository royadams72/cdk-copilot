import test from "node:test";
import assert from "node:assert/strict";
import type {
  TCofidNutrientProfile,
  TFoodSearchInput,
  TOpenFoodFactsCandidate,
} from "@ckd/core";
import { buildFoodResolutionResult } from "./buildFoodResolutionResult";
import { classifyFoodQuery } from "./classifyFoodQuery";
import { mergeNutrients } from "./mergeNutrients";
import { normalizeFoodQuery } from "./normalizeFoodQuery";
import { scoreOpenFoodFactsResults } from "./scoreOpenFoodFactsResults";
import { searchFood } from "./searchFood";
import { selectBestOpenFoodFactsResult } from "./selectBestOpenFoodFactsResult";

const genericRice: TCofidNutrientProfile = {
  category: "Cereals and cereal products",
  foodCode: "13-001",
  foodName: "Rice, basmati, boiled",
  keywords: ["rice", "basmati", "boiled"],
  normalizedName: "rice basmati boiled",
  nutrientsPer100g: {
    caloriesKcal: 121,
    carbsG: 25.2,
    fatG: 0.4,
    phosphorusMg: 43,
    potassiumMg: 29,
    proteinG: 2.6,
    sodiumMg: 1,
  },
  source: "cofid",
};

const brandedBurger: TOpenFoodFactsCandidate = {
  barcode: "5010029204562",
  brand: "Birds Eye",
  categories: ["en:burgers", "en:frozen-foods"],
  countries: ["en:united-kingdom"],
  imageUrl: null,
  normalizedName: "birds eye chicken burger",
  nutrimentsQualityWarnings: [],
  nutrientsPer100g: {
    caloriesKcal: 210,
    carbsG: 18,
    fatG: 9.8,
    proteinG: 12.6,
    sodiumMg: 520,
  },
  productName: "Chicken Burgers",
  quantity: "284 g",
  servingSize: null,
  source: "open_food_facts",
  ukMarketMatch: true,
};

const plainRicePack: TOpenFoodFactsCandidate = {
  barcode: "111",
  brand: "Tesco",
  categories: ["en:rices", "en:microwaveable-foods"],
  countries: ["en:united-kingdom"],
  imageUrl: null,
  normalizedName: "tesco basmati rice",
  nutrimentsQualityWarnings: [],
  nutrientsPer100g: {
    caloriesKcal: 145,
    carbsG: 31,
    proteinG: 3,
    sodiumMg: 5,
  },
  productName: "Basmati Rice",
  quantity: "250 g",
  servingSize: null,
  source: "open_food_facts",
  ukMarketMatch: true,
};

const flavouredRicePack: TOpenFoodFactsCandidate = {
  ...plainRicePack,
  barcode: "222",
  normalizedName: "tesco basmati rice curry flavour",
  nutrimentsQualityWarnings: ["nutrition-data-incomplete"],
  productName: "Basmati Rice Curry Flavour",
};

test("classification distinguishes branded, generic, and meal-like queries", () => {
  const branded = buildInput("Birds Eye chicken burger");
  const generic = buildInput("basmati rice");
  const mealLike = buildInput("basmati rice with curry");

  assert.equal(classifyFoodQuery(branded, normalizeFoodQuery(branded)), "mixed");
  assert.equal(classifyFoodQuery(generic, normalizeFoodQuery(generic)), "generic");
  assert.equal(classifyFoodQuery(mealLike, normalizeFoodQuery(mealLike)), "meal_like");
});

test("normalization rewrites brown bread to wholemeal-first search variants", () => {
  const normalized = normalizeFoodQuery(buildInput("brown bread"));

  assert.equal(normalized.canonicalText, "wholemeal bread");
  assert.ok(normalized.searchVariants.includes("wholemeal bread"));
  assert.ok(normalized.searchVariants.includes("brown bread"));
});

test("normalization strips leading amounts before synonym rewrites", () => {
  const normalized = normalizeFoodQuery(buildInput("100g of brown bread"));

  assert.equal(normalized.compactText, "brown bread");
  assert.equal(normalized.canonicalText, "wholemeal bread");
});

test("OFF scoring prefers plain UK rice over flavoured generic variants", () => {
  const input = buildInput("basmati rice");
  const scored = scoreOpenFoodFactsResults(normalizeFoodQuery(input), "generic", [
    flavouredRicePack,
    plainRicePack,
  ]).sort((left, right) => right.score - left.score);

  assert.equal(scored[0]?.candidate.barcode, "111");
  assert.ok(scored[0]!.score > scored[1]!.score);
});

test("OFF selection rejects ambiguous cooked basmati rice results", () => {
  const input = buildInput("200g cooked basmati rice", { grams: 200, preparation: "cooked" });
  const scored = scoreOpenFoodFactsResults(normalizeFoodQuery(input), "generic", [
    plainRicePack,
    { ...plainRicePack, barcode: "333", brand: "Tilda", normalizedName: "tilda basmati rice", productName: "Pure Basmati Rice" },
  ]);
  const selected = selectBestOpenFoodFactsResult(normalizeFoodQuery(input), "generic", scored);

  assert.equal(selected.goodEnough, false);
  assert.ok(selected.ambiguityFlags.includes("off_ambiguous"));
});

test("mergeNutrients preserves OFF values and fills missing CKD nutrients from CoFID", () => {
  const merged = mergeNutrients({
    cofid: genericRice.nutrientsPer100g,
    off: brandedBurger.nutrientsPer100g,
  });

  assert.equal(merged.nutrients.sodiumMg, 520);
  assert.equal(merged.nutrients.potassiumMg, 29);
  assert.equal(
    merged.provenance.find((entry) => entry.nutrient === "potassiumMg")?.source,
    "cofid_reference",
  );
});

test("searchFood returns OFF plus CoFID enrichment for strong branded matches", async () => {
  const result = await searchFood(buildInput("Birds Eye chicken burger"), {
    cofidEnricher: async () => genericRice,
    genericResolver: async () => ({ alternatives: [], selected: genericRice }),
    offSearch: async () => [brandedBurger],
  });

  assert.equal(result.resolutionPath, "off_plus_cofid");
  assert.equal(result.selectedResult.displayName, "Birds Eye Chicken Burgers");
  assert.equal(result.nutrients.phosphorusMg, 43);
});

test("searchFood falls back to CoFID when generic burger results are mixed", async () => {
  const result = await searchFood(buildInput("burger"), {
    genericResolver: async () => ({
      alternatives: [],
      selected: {
        ...genericRice,
        foodCode: "18-002",
        foodName: "Burger, grilled, plain",
        normalizedName: "burger grilled plain",
      },
    }),
    offSearch: async () => [
      { ...brandedBurger, barcode: "a1", brand: "Store", productName: "Spicy Chicken Burger" },
      { ...brandedBurger, barcode: "a2", brand: "Store", productName: "Beef Burger" },
    ],
  });

  assert.equal(result.resolutionPath, "cofid_generic");
  assert.ok(result.ambiguityFlags.includes("generic_fallback"));
});

test("searchFood falls back to CoFID when OFF is unavailable", async () => {
  const result = await searchFood(buildInput("200g cooked basmati rice", { grams: 200, preparation: "cooked" }), {
    genericResolver: async () => ({ alternatives: [], selected: genericRice }),
    offSearch: async () => {
      throw new Error("network down");
    },
  });

  assert.equal(result.resolutionPath, "cofid_generic");
  assert.ok(result.ambiguityFlags.includes("off_unavailable"));
});

test("searchFood uses synonym-normalized variants for brown bread", async () => {
  const requestedQueries: string[] = [];
  const brownBread: TCofidNutrientProfile = {
    category: "Cereals and cereal products",
    foodCode: "19-001",
    foodName: "Bread, wholemeal",
    keywords: ["bread", "wholemeal"],
    normalizedName: "bread wholemeal",
    nutrientsPer100g: {
      caloriesKcal: 247,
      carbsG: 41.2,
      fatG: 3.4,
      phosphorusMg: 210,
      potassiumMg: 230,
      proteinG: 8.8,
      sodiumMg: 410,
    },
    source: "cofid",
  };

  const result = await searchFood(buildInput("brown bread"), {
    genericResolver: async () => ({ alternatives: [], selected: brownBread }),
    offSearch: async (query) => {
      requestedQueries.push(query);
      return [];
    },
  });

  assert.ok(requestedQueries.includes("wholemeal bread"));
  assert.equal(result.selectedResult.displayName, "Bread, wholemeal");
  assert.equal(result.nutrients.caloriesKcal, 247);
});

test("resolver output builder supports generic CoFID selection", () => {
  const result = buildFoodResolutionResult({
    ambiguityFlags: ["generic_fallback"],
    alternatives: [],
    cofid: genericRice,
    normalizedQuery: "basmati rice",
    query: "basmati rice",
    queryKind: "generic",
    resolutionPath: "cofid_generic",
  });

  assert.equal(result.selectedResult.source, "cofid");
  assert.equal(result.provenance.find((entry) => entry.nutrient === "phosphorusMg")?.source, "cofid_reference");
});

test("resolver output builder falls back to a placeholder instead of throwing", () => {
  const result = buildFoodResolutionResult({
    ambiguityFlags: ["generic_fallback", "no_reference_match"],
    alternatives: [],
    normalizedQuery: "mystery food",
    query: "mystery food",
    queryKind: "unknown",
    resolutionPath: "cofid_generic",
  });

  assert.equal(result.selectedResult.displayName, "mystery food");
  assert.equal(result.selectedResult.source, "cofid");
});

function buildInput(
  query: string,
  hints?: TFoodSearchInput["hints"],
): TFoodSearchInput {
  return {
    hints,
    normalizedText: query.toLowerCase(),
    query,
  };
}
