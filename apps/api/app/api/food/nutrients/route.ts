import { requireUser, SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  ROLES,
  TEdamamMeasure,
  TEdamamFoodMeasure,
  TEdamamNutritionLookupItem,
  TEdamamNutritionLookupResult,
} from "@ckd/core";
import type { TFoodMappingRecord } from "@/packages/core/src/isomorphic/schemas/food_search";
import { NextRequest } from "next/server";

const foodAppKey = process.env.EDAMAM_API_KEY || "";
const foodUri = process.env.EDAMAM_API_FOOD_URI || "";
const nutrientsUri = process.env.EDAMAM_API_NUTRIENTS_URI || "";
const foodAppID = process.env.EDAMAM_API_ID || "";
const EDAMAM_GRAM_MEASURE_URI =
  "http://www.edamam.com/ontologies/edamam.owl#Measure_gram";
type NutritionLookupItem = TEdamamNutritionLookupItem & {
  brand?: string;
  source?: "user" | "barcode" | "image_ai" | "api";
};
const SEARCH_CATEGORIES = ["packaged-foods", "generic-foods"] as const;

export async function POST(req: NextRequest) {
  const requestId = makeRandomId();
  const user: SessionUser = await requireUser(req);

  if (user.role !== ROLES.Patient) {
    return bad("Patient context missing", { requestId }, 403);
  }

  const body = await req.json();

  if (!foodAppID || !foodAppKey || !nutrientsUri || !foodUri) {
    return bad("App vars not found", { requestId }, 403);
  }

  try {
    const lookupItems = Array.isArray(body) ? body : body?.reqIngredients;
    if (!Array.isArray(lookupItems) || lookupItems.length === 0) {
      return bad("Invalid ingredients payload", { requestId }, 400);
    }

    const params = new URLSearchParams({
      app_id: foodAppID,
      app_key: foodAppKey,
    });

    const results = await Promise.all(
      lookupItems.map(async (lookupItem: NutritionLookupItem) => {
        const resolvedLookup = await resolveLookupItem(lookupItem);
        let response = null;
        let resolvedMeasure = {
          label: "gram",
          measureURI: EDAMAM_GRAM_MEASURE_URI,
        };

        if (resolvedLookup) {
          resolvedMeasure = resolveMeasureInfo(resolvedLookup);
          response = await requestNutrition(
            resolvedLookup,
            resolvedMeasure,
            params,
          );
        }

        if (!response && lookupItem.source === "barcode") {
          response = await retryBarcodeNutritionLookup(
            lookupItem,
            params,
          );
        }
        if (!response) {
          throw new Error("Failed to fetch nutrients");
        }
        return {
          requestedFoodId: lookupItem.foodId,
          resolvedMeasure,
          response,
        } satisfies TEdamamNutritionLookupResult;
      }),
    );

    return ok(results);
  } catch (error) {
    console.log(error);
    return bad(
      error instanceof Error ? error.message : "Failed to fetch nutrients",
      { requestId },
      502,
    );
  }
}

async function resolveLookupItem(
  lookupItem: NutritionLookupItem,
): Promise<NutritionLookupItem | null> {
  if (lookupItem.source !== "barcode") {
    return lookupItem;
  }

  const mapping = await getReviewedOffMapping(lookupItem.foodId);
  if (!mapping?.edamamMatch?.foodId) {
    return null;
  }

  const searchQuery = [mapping.brand, mapping.productName, mapping.edamamMatch.foodLabel]
    .filter(Boolean)
    .join(" ")
    .trim();
  const hints = await fetchEdamamHints(searchQuery || mapping.edamamMatch.foodLabel);
  const matched =
    hints.find((hint) => hint.food.foodId === mapping.edamamMatch.foodId) ??
    hints.find(
      (hint) =>
        hint.food.label.trim().toLowerCase() ===
        mapping.edamamMatch.foodLabel.trim().toLowerCase(),
    ) ??
    null;

  if (!matched) {
    return {
      ...lookupItem,
      foodId: mapping.edamamMatch.foodId,
    };
  }

  return {
    ...lookupItem,
    foodId: matched.food.foodId,
    foodName: matched.food.label,
    measures: matched.measures ?? [],
  };
}

async function requestNutrition(
  lookupItem: NutritionLookupItem,
  resolvedMeasure: ReturnType<typeof resolveMeasureInfo>,
  params: URLSearchParams,
) {
  const ingredients = [
    {
      foodId: lookupItem.foodId,
      measureURI: resolvedMeasure.measureURI,
      qualifiers: resolvedMeasure.qualifiers,
      quantity: lookupItem.quantity,
    },
  ];

  const res = await fetch(`${nutrientsUri}?${params.toString()}`, {
    body: JSON.stringify({ ingredients }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (!res.ok) {
    return null;
  }

  const response = normalizeNutritionResponse(await res.json());
  const parsedCount = response.ingredients?.reduce(
    (sum: number, ingredient: any) => sum + (ingredient?.parsed?.length ?? 0),
    0,
  );
  if (!parsedCount) {
    return null;
  }

  return response;
}

async function retryBarcodeNutritionLookup(
  originalLookup: NutritionLookupItem,
  params: URLSearchParams,
) {
  const mainTerms = extractFallbackTerms(
    originalLookup.foodName,
    originalLookup.originalText,
    originalLookup.brand,
  );

  for (const term of mainTerms) {
    const hints = await fetchEdamamHints(term);
    const fallbackHint =
      hints.find((hint) => hasWord(normalizeLookupText(hint.food.label), term)) ??
      hints.find((hint) => hasWord(normalizeLookupText(hint.food.knownAs), term)) ??
      null;

    if (!fallbackHint) continue;

    const fallbackLookup: NutritionLookupItem = {
      ...originalLookup,
      foodId: fallbackHint.food.foodId,
      foodName: fallbackHint.food.label,
      measures: fallbackHint.measures ?? [],
      source: "api",
    };
    const fallbackMeasure = resolveMeasureInfo(fallbackLookup);
    const response = await requestNutrition(fallbackLookup, fallbackMeasure, params);
    if (response) {
      return response;
    }
  }

  return null;
}

async function getReviewedOffMapping(barcode: string) {
  const db = await getDb();
  const collection = db.collection<TFoodMappingRecord>("food_mappings");
  return collection.findOne({
    barcode,
    mappingStatus: "reviewed",
    source: "open_food_facts",
  });
}

async function fetchEdamamHints(query: string): Promise<TEdamamFoodMeasure[]> {
  const responses = await Promise.all(
    SEARCH_CATEGORIES.map(async (category) => {
      const params = new URLSearchParams({
        app_id: foodAppID,
        app_key: foodAppKey,
        ingr: query,
        "nutrition-type": "logging",
      });
      params.append("category", category);

      const res = await fetch(`${foodUri}?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Edamam error (${res.status})`);
      }

      const data = await res.json();
      return (data?.hints ?? []) as TEdamamFoodMeasure[];
    }),
  );

  const deduped = new Map<string, TEdamamFoodMeasure>();
  for (const hint of responses.flat()) {
    if (!deduped.has(hint.food.foodId)) {
      deduped.set(hint.food.foodId, hint);
    }
  }

  return [...deduped.values()];
}

function resolveMeasureInfo(ingredient: TEdamamNutritionLookupItem) {
  if (ingredient.measureURI) {
    return {
      label: findMeasureLabel(ingredient.measures, ingredient.measureURI),
      measureURI: ingredient.measureURI,
    };
  }

  const measures = ingredient.measures ?? [];
  if (!measures.length) {
    return { label: "gram", measureURI: EDAMAM_GRAM_MEASURE_URI };
  }

  const normalizedUnit = (ingredient.unit ?? "").trim().toLowerCase();
  const normalizedFood = (ingredient.foodName ?? "").trim().toLowerCase();

  const resolveMeasure = (
    measure: TEdamamMeasure,
  ): {
    label: string;
    measureURI: string;
    qualifiers?: string[];
  } => {
    if (Array.isArray(measure.qualified) && measure.qualified.length > 0) {
      const qualifiers = Array.from(
        new Set(
          measure.qualified.flatMap((entry) =>
            entry.qualifiers.map((qualifier) => qualifier.uri),
          ),
        ),
      );
      return {
        label: measure.label ?? "",
        measureURI: measure.uri,
        qualifiers,
      };
    }

    return {
      label: measure.label ?? "",
      measureURI: measure.uri,
    };
  };

  const findMeasure = (labels: string[]) =>
    measures.find((measure) =>
      labels.some(
        (label) => (measure.label ?? "").trim().toLowerCase() === label,
      ),
    );

  if (normalizedUnit) {
    const explicit = findMeasure([normalizedUnit]);
    if (explicit) return resolveMeasure(explicit);
  }

  if (shouldPreferServing(ingredient)) {
    const serving = findMeasure(["serving"]);
    if (serving) return resolveMeasure(serving);
  }

  if (normalizedFood) {
    const named = measures.find((measure) =>
      normalizedFood.includes((measure.label ?? "").trim().toLowerCase()),
    );
    if (named) return resolveMeasure(named);
  }

  const fallbackOrder = [
    "serving",
    "whole",
    "gram",
    "ounce",
    "pound",
    "kilogram",
  ];
  for (const label of fallbackOrder) {
    const fallback = findMeasure([label]);
    if (fallback) return resolveMeasure(fallback);
  }

  return resolveMeasure(measures[0]);
}

function shouldPreferServing(ingredient: TEdamamNutritionLookupItem) {
  const normalizedUnit = (ingredient.unit ?? "").trim().toLowerCase();
  const normalizedOriginal = (
    ingredient.originalText ??
    ingredient.foodName ??
    ""
  )
    .trim()
    .toLowerCase();

  if (/\bwhole\b/.test(normalizedOriginal)) return false;
  if (normalizedUnit === "whole") return false;
  if (
    normalizedUnit &&
    !["leg", "drumstick", "thigh", "wing", "breast"].includes(normalizedUnit)
  ) {
    return false;
  }

  const hasExplicitMeasure =
    /\b(g|gram|grams|kg|kilogram|kilograms|oz|ounce|ounces|lb|lbs|pound|pounds|ml|milliliter|milliliters|l|liter|liters|cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|slice|slices|piece|pieces|serving|servings)\b/.test(
      normalizedOriginal,
    );

  if (hasExplicitMeasure) return false;

  return Number.isInteger(ingredient.quantity) && ingredient.quantity > 0;
}

function findMeasureLabel(measures: TEdamamMeasure[], measureURI: string) {
  return measures.find((measure) => measure.uri === measureURI)?.label ?? "";
}

function normalizeNutritionResponse(response: any) {
  return {
    ...response,
    calories: roundNumber(response?.calories),
    ingredients: Array.isArray(response?.ingredients)
      ? response.ingredients.map((ingredient: any) => ({
          ...ingredient,
          parsed: Array.isArray(ingredient?.parsed)
            ? ingredient.parsed.map((parsed: any) => ({
                ...parsed,
                quantity: roundNumber(parsed?.quantity),
                retainedWeight: roundOptionalNumber(parsed?.retainedWeight),
                weight: roundNumber(parsed?.weight),
              }))
            : [],
        }))
      : [],
    totalDaily: roundNutrientMap(response?.totalDaily),
    totalNutrients: roundNutrientMap(response?.totalNutrients),
    totalWeight: roundNumber(response?.totalWeight),
  };
}

function roundNutrientMap(
  map:
    | Record<string, { label: string; quantity: number; unit: string }>
    | undefined,
) {
  if (!map) return {};

  return Object.fromEntries(
    Object.entries(map)
      .map(([key, value]) => {
        const quantity = roundOptionalNumber(value?.quantity);
        if (quantity === undefined) return null;
        return [
          key,
          {
            ...value,
            quantity,
          },
        ] as const;
      })
      .filter((entry): entry is readonly [string, { label: string; quantity: number; unit: string }] => entry !== null),
  );
}

function roundNumber(value: number | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundOptionalNumber(value: number | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeLookupText(text?: string) {
  return (text ?? "")
    .trim()
    .toLowerCase()
    .replace(/\btinned\b/g, "canned")
    .replace(/\btin\b/g, "can")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ");
}

function extractFallbackTerms(...values: Array<string | undefined>) {
  const text = values
    .map(normalizeLookupText)
    .filter(Boolean)
    .join(" ");

  const preferredTerms = [
    "tomato",
    "bean",
    "beans",
    "chickpea",
    "lentil",
    "tuna",
    "salmon",
    "sardine",
    "mackerel",
    "corn",
    "sweetcorn",
    "coconut",
    "pumpkin",
    "tomatoes",
    "peas",
  ];
  const foundPreferred = preferredTerms.filter((term) => hasWord(text, term));
  if (foundPreferred.length) {
    return [...new Set(foundPreferred.map(singularizeLookupTerm))];
  }

  const genericStopWords = new Set([
    "can",
    "canned",
    "tinned",
    "in",
    "water",
    "brine",
    "sauce",
    "salted",
    "unsalted",
    "chopped",
    "diced",
    "whole",
    "peeled",
    "organic",
    "reduced",
    "salt",
    "no",
    "added",
  ]);

  const tokens = text
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token && !genericStopWords.has(token));

  return [...new Set(tokens.map(singularizeLookupTerm).slice(-2))];
}

function singularizeLookupTerm(term: string) {
  if (term === "tomatoes") return "tomato";
  if (term.endsWith("ies")) return `${term.slice(0, -3)}y`;
  if (term.endsWith("es")) return term.slice(0, -2);
  if (term.endsWith("s") && term.length > 3) return term.slice(0, -1);
  return term;
}

function hasWord(text: string, word: string) {
  return new RegExp(`\\b${escapeRegex(word)}\\b`, "i").test(text);
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
