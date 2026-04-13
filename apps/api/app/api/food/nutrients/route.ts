import { requireUser, SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  ROLES,
  TEdamamFoodMeasure,
  TEdamamMeasure,
  TEdamamNutritionLookupItem,
  TEdamamNutritionLookupResult,
} from "@ckd/core";
import { NextRequest } from "next/server";

const foodAppKey = process.env.EDAMAM_API_KEY || "";
const foodUri = process.env.EDAMAM_API_FOOD_URI || "";
const nutrientsUri = process.env.EDAMAM_API_NUTRIENTS_URI || "";
const foodAppID = process.env.EDAMAM_API_ID || "";
const EDAMAM_GRAM_MEASURE_URI =
  "http://www.edamam.com/ontologies/edamam.owl#Measure_gram";
const SEARCH_CATEGORIES = ["packaged-foods", "generic-foods"] as const;

type NutritionLookupItem = TEdamamNutritionLookupItem & {
  brand?: string;
  source?: "user" | "image_ai" | "api";
};

export async function POST(req: NextRequest) {
  const requestId = makeRandomId();
  const user: SessionUser = await requireUser(req);

  if (user.role !== ROLES.Patient) {
    return bad("Patient context missing", { requestId }, 403);
  }

  if (!foodAppID || !foodAppKey || !nutrientsUri || !foodUri) {
    return bad("App vars not found", { requestId }, 403);
  }

  try {
    const body = await req.json();
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
        let resolvedLookup = lookupItem;
        let resolvedMeasure = resolveMeasureInfo(resolvedLookup);
        let response = await requestNutrition(
          resolvedLookup,
          resolvedMeasure,
          params,
        );

        if (!response) {
          const fallback = await retryNutritionLookup(lookupItem, params);
          if (fallback) {
            resolvedLookup = fallback.lookup;
            resolvedMeasure = fallback.measure;
            response = fallback.response;
          }
        }

        if (!response) {
          throw new Error("Failed to fetch nutrients");
        }

        response = alignEdamamResponseToRequestedPortion(response, lookupItem);

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

async function retryNutritionLookup(
  originalLookup: NutritionLookupItem,
  params: URLSearchParams,
) {
  const candidateQueries = buildLookupQueries(originalLookup);

  for (const query of candidateQueries) {
    const candidates = await fetchEdamamCandidates(query);
    const bestHint = pickBestFallbackHint(candidates, originalLookup, query);
    if (!bestHint) continue;

    const fallbackLookup: NutritionLookupItem = {
      ...originalLookup,
      foodId: bestHint.food.foodId,
      foodName: bestHint.food.label,
      measures: bestHint.measures ?? [],
      source: "api",
    };
    const fallbackMeasure = resolveMeasureInfo(fallbackLookup);
    const response = await requestNutrition(
      fallbackLookup,
      fallbackMeasure,
      params,
    );
    if (response) {
      return {
        lookup: fallbackLookup,
        measure: fallbackMeasure,
        response,
      };
    }
  }

  return null;
}

function buildLookupQueries(lookupItem: NutritionLookupItem) {
  const normalizedBrand = normalizeLookupText(lookupItem.brand);
  const normalizedFoodName = normalizeLookupText(lookupItem.foodName);
  const normalizedOriginal = normalizeLookupText(lookupItem.originalText);

  return [
    [normalizedBrand, normalizedFoodName].filter(Boolean).join(" ").trim(),
    [normalizedBrand, normalizedOriginal].filter(Boolean).join(" ").trim(),
    normalizedFoodName,
    normalizedOriginal,
  ].filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);
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
  if (!hasUsableNutritionResponse(response)) {
    return null;
  }

  return response;
}

async function fetchEdamamCandidates(
  query: string,
): Promise<TEdamamFoodMeasure[]> {
  const responses = await Promise.all(
    SEARCH_CATEGORIES.map(async (category) => {
      const params = new URLSearchParams({
        app_id: foodAppID,
        app_key: foodAppKey,
        ingr: query,
        "nutrition-type": "cooking",
      });
      params.append("category", category);

      const res = await fetch(`${foodUri}?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Edamam error (${res.status})`);
      }

      const data = await res.json();
      return [
        ...toParsedCandidates(data?.parsed),
        ...((data?.hints ?? []) as TEdamamFoodMeasure[]),
      ];
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

function toParsedCandidates(parsed: unknown): TEdamamFoodMeasure[] {
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;

      const record = entry as {
        food?: TEdamamFoodMeasure["food"];
        measure?: TEdamamFoodMeasure["measures"][number];
      };
      if (!record.food) return null;

      return {
        food: record.food,
        measures: record.measure ? [record.measure] : [],
      } satisfies TEdamamFoodMeasure;
    })
    .filter((entry): entry is TEdamamFoodMeasure => entry !== null);
}

function pickBestFallbackHint(
  hints: TEdamamFoodMeasure[],
  lookupItem: NutritionLookupItem,
  query: string,
) {
  const desiredText = [
    normalizeLookupText(lookupItem.brand),
    normalizeLookupText(lookupItem.foodName),
    normalizeLookupText(lookupItem.originalText),
    normalizeLookupText(query),
  ]
    .filter(Boolean)
    .join(" ");
  let best: TEdamamFoodMeasure | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const hint of hints) {
    const score = scoreFallbackHint(hint, desiredText);
    if (score > bestScore) {
      best = hint;
      bestScore = score;
    }
  }

  return bestScore >= 20 ? best : null;
}

function scoreFallbackHint(hint: TEdamamFoodMeasure, desiredText: string) {
  const label = normalizeLookupText(hint.food.label);
  const knownAs = normalizeLookupText(hint.food.knownAs);
  const brand = normalizeLookupText(hint.food.brand);
  const category = normalizeLookupText(hint.food.category);
  const desiredTokens = desiredText.split(" ").filter(Boolean);
  let score = 0;

  for (const token of desiredTokens) {
    if (hasWord(label, token) || hasWord(knownAs, token)) score += 16;
    if (hasWord(brand, token)) score += 10;
  }

  if (category.includes("packaged")) score += 8;
  if (normalizeLookupText(hint.food.label) === normalizeLookupText(desiredText)) {
    score += 40;
  }

  return score;
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

function alignEdamamResponseToRequestedPortion(
  response: any,
  originalLookup: NutritionLookupItem,
) {
  const requestedWeight = resolveRequestedPortionWeight(originalLookup);
  const responseWeight = resolveEdamamResponseWeight(response);

  if (
    typeof requestedWeight !== "number" ||
    !Number.isFinite(requestedWeight) ||
    requestedWeight <= 0 ||
    typeof responseWeight !== "number" ||
    !Number.isFinite(responseWeight) ||
    responseWeight <= 0
  ) {
    return response;
  }

  const ratio = requestedWeight / responseWeight;
  if (!Number.isFinite(ratio) || ratio <= 0 || Math.abs(ratio - 1) < 0.01) {
    return response;
  }

  return normalizeNutritionResponse({
    ...response,
    calories:
      typeof response?.calories === "number"
        ? response.calories * ratio
        : response?.calories,
    totalDaily: scaleNutrientMap(response?.totalDaily, ratio),
    totalNutrients: scaleNutrientMap(response?.totalNutrients, ratio),
    totalWeight: requestedWeight,
  });
}

function resolveRequestedPortionWeight(lookupItem: NutritionLookupItem) {
  const normalizedUnit = normalizeMeasureLabel(lookupItem.unit);
  if (["g", "gram", "grams"].includes(normalizedUnit)) {
    return lookupItem.quantity;
  }

  const matchingMeasure = lookupItem.measures?.find(
    (measure) => normalizeMeasureLabel(measure.label) === normalizedUnit,
  );
  if (
    matchingMeasure &&
    typeof matchingMeasure.weight === "number" &&
    Number.isFinite(matchingMeasure.weight) &&
    matchingMeasure.weight > 0 &&
    typeof lookupItem.quantity === "number" &&
    Number.isFinite(lookupItem.quantity) &&
    lookupItem.quantity > 0
  ) {
    return matchingMeasure.weight * lookupItem.quantity;
  }

  return undefined;
}

function resolveEdamamResponseWeight(response: any) {
  if (
    typeof response?.totalWeight === "number" &&
    Number.isFinite(response.totalWeight) &&
    response.totalWeight > 0
  ) {
    return response.totalWeight;
  }

  const parsedWeight = response?.ingredients
    ?.flatMap((ingredient: any) => ingredient?.parsed ?? [])
    ?.find(
      (parsed: any) => typeof parsed?.weight === "number" && parsed.weight > 0,
    )?.weight;

  return typeof parsedWeight === "number" && Number.isFinite(parsedWeight)
    ? parsedWeight
    : undefined;
}

function scaleNutrientMap(
  map:
    | Record<string, { label: string; quantity: number; unit: string }>
    | undefined,
  ratio: number,
) {
  if (!map) return {};

  return Object.fromEntries(
    Object.entries(map).map(([key, value]) => [
      key,
      {
        ...value,
        quantity:
          typeof value?.quantity === "number" && Number.isFinite(value.quantity)
            ? value.quantity * ratio
            : value?.quantity,
      },
    ]),
  );
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

function hasUsableNutritionResponse(response: any) {
  const parsedCount = Array.isArray(response?.ingredients)
    ? response.ingredients.reduce(
        (sum: number, ingredient: any) => sum + (ingredient?.parsed?.length ?? 0),
        0,
      )
    : 0;

  if (parsedCount > 0) return true;

  const nutrientEntries = response?.totalNutrients;
  if (!nutrientEntries || typeof nutrientEntries !== "object") return false;

  return Object.values(nutrientEntries).some(
    (entry: any) =>
      typeof entry?.quantity === "number" &&
      Number.isFinite(entry.quantity) &&
      entry.quantity > 0,
  );
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
      .filter(
        (
          entry,
        ): entry is readonly [
          string,
          { label: string; quantity: number; unit: string },
        ] => entry !== null,
      ),
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

function normalizeMeasureLabel(value?: string) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeLookupText(text?: string) {
  return (text ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ");
}

function hasWord(text: string, word: string) {
  return new RegExp(`\\b${escapeRegex(word)}\\b`, "i").test(text);
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
