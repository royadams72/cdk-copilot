import { getDb } from "@/apps/api/lib/db/mongodb";
import type {
  TCofidNutrientProfile,
  TFoodSearchInput,
} from "@ckd/core";
import { COLLECTIONS, getCollection } from "@ckd/core/server";
import type { Filter } from "mongodb";
import type { NormalizedFoodQuery } from "./normalizeFoodQuery";

type BaseFoodRecord = {
  category?: string | null;
  description: string;
  keywords: string[];
  nutrientsPer100g: {
    energyKcal?: number | null;
    carbs_g?: number | null;
    fat_g?: number | null;
    fiber_g?: number | null;
    phosphorus_mg?: number | null;
    potassium_mg?: number | null;
    protein_g?: number | null;
    sodium_mg?: number | null;
  };
  searchName: string;
  sourceFoodCode: string;
};

export async function resolveGenericFood(
  input: TFoodSearchInput,
  normalized: NormalizedFoodQuery,
): Promise<{ alternatives: TCofidNutrientProfile[]; selected: TCofidNutrientProfile | null }> {
  const db = await getDb();
  const collection = getCollection<BaseFoodRecord>(db, COLLECTIONS.BaseFoods);
  const filters: Filter<BaseFoodRecord>[] = [];
  const variantTokens = normalized.searchVariants.map((variant) =>
    variant
      .split(" ")
      .map((token) => token.trim())
      .filter(Boolean)
      .slice(0, 6),
  );

  for (const tokens of variantTokens) {
    if (tokens.length > 0) {
      filters.push({ keywords: { $all: tokens } });
    }
  }

  for (const variant of normalized.searchVariants) {
    filters.push({ searchName: { $regex: escapeForRegex(variant), $options: "i" } });
  }

  if (filters.length === 0) {
    filters.push({
      searchName: { $regex: escapeForRegex(input.normalizedText), $options: "i" },
    });
  }

  const rows = await collection
    .find(filters.length === 1 ? filters[0] : { $or: filters })
    .limit(25)
    .toArray();

  const ranked = rows
    .map((row) => ({
      item: toCofidProfile(row),
      score: scoreGenericRow(normalized, row),
    }))
    .sort((left, right) => right.score - left.score);

  return {
    alternatives: ranked.slice(1, 6).map((entry) => entry.item),
    selected: ranked[0]?.item ?? null,
  };
}

function toCofidProfile(row: BaseFoodRecord): TCofidNutrientProfile {
  return {
    category: row.category ?? null,
    foodCode: row.sourceFoodCode,
    foodName: row.description,
    keywords: row.keywords,
    normalizedName: row.searchName,
    nutrientsPer100g: {
      caloriesKcal: normalizeNumber(row.nutrientsPer100g.energyKcal),
      carbsG: normalizeNumber(row.nutrientsPer100g.carbs_g),
      fatG: normalizeNumber(row.nutrientsPer100g.fat_g),
      fiberG: normalizeNumber(row.nutrientsPer100g.fiber_g),
      phosphorusMg: normalizeNumber(row.nutrientsPer100g.phosphorus_mg),
      potassiumMg: normalizeNumber(row.nutrientsPer100g.potassium_mg),
      proteinG: normalizeNumber(row.nutrientsPer100g.protein_g),
      sodiumMg: normalizeNumber(row.nutrientsPer100g.sodium_mg),
    },
    source: "cofid",
  };
}

function scoreGenericRow(query: NormalizedFoodQuery, row: BaseFoodRecord) {
  const haystack = `${row.searchName} ${row.description}`.toLowerCase();
  const tokenHits = query.tokens.filter((token) => haystack.includes(token)).length;
  const coverage = query.tokens.length ? tokenHits / query.tokens.length : 0;
  const exact = query.searchVariants.some((variant) => haystack.includes(variant)) ? 22 : 0;
  const synonymBonus =
    query.compactText !== query.canonicalText && haystack.includes(query.canonicalText) ? 12 : 0;
  const cookedBonus =
    query.hasCookedHint && /\b(cooked|boiled|steamed|fried|roasted)\b/.test(haystack) ? 10 : 0;
  const plainBonus =
    !query.hasCookedHint && /\bplain\b/.test(haystack) ? 6 : 0;

  return coverage * 60 + exact + synonymBonus + cookedBonus + plainBonus;
}

function normalizeNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
