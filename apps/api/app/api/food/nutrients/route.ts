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
        if (!resolvedLookup) {
          throw new Error(`No mapped Edamam food found for ${lookupItem.foodName ?? lookupItem.foodId}`);
        }

        const resolvedMeasure = resolveMeasureInfo(resolvedLookup);
        const ingredients = [
          {
            foodId: resolvedLookup.foodId,
            measureURI: resolvedMeasure.measureURI,
            qualifiers: resolvedMeasure.qualifiers,
            quantity: resolvedLookup.quantity,
          },
        ];

        const res = await fetch(`${nutrientsUri}?${params.toString()}`, {
          body: JSON.stringify({ ingredients }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });

        if (!res.ok) {
          throw new Error(`${res.status} Failed to fetch nutrients`);
        }

        const response = normalizeNutritionResponse(await res.json());
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
  const params = new URLSearchParams({
    app_id: foodAppID,
    app_key: foodAppKey,
    ingr: query,
    "nutrition-type": "logging",
  });
  params.append("category", "packaged-foods");

  const res = await fetch(`${foodUri}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Edamam error (${res.status})`);
  }

  const data = await res.json();
  return (data?.hints ?? []) as TEdamamFoodMeasure[];
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
    Object.entries(map).map(([key, value]) => [
      key,
      {
        ...value,
        quantity: roundNumber(value?.quantity),
      },
    ]),
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
