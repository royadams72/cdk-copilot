import type {
  TCofidNutrientProfile,
  TFoodMappingRecord,
  TOpenFoodFactsCandidate,
} from "@ckd/core";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { COLLECTIONS, getCollection } from "@ckd/core/server";

export async function enrichWithCofid(
  offCandidate: TOpenFoodFactsCandidate,
  genericMatch: TCofidNutrientProfile | null,
): Promise<TCofidNutrientProfile | null> {
  const reviewedMapping = await getReviewedMapping(offCandidate.barcode);
  if (reviewedMapping) {
    const cofid = await getCofidByCode(reviewedMapping.cofidMatch.foodCode);
    if (cofid) return cofid;
  }

  if (genericMatch && offCandidate.barcode) {
    await upsertPendingMapping(offCandidate, genericMatch);
  }

  return genericMatch;
}

async function getReviewedMapping(barcode: string | null) {
  if (!barcode) return null;
  const db = await getDb();
  const collection = getCollection<TFoodMappingRecord>(db, COLLECTIONS.FoodMappings);
  return collection.findOne({
    barcode,
    mappingStatus: "reviewed",
    source: "open_food_facts",
  });
}

async function getCofidByCode(foodCode: string) {
  const db = await getDb();
  const collection = getCollection<{
    category?: string | null;
    description: string;
    keywords: string[];
    nutrientsPer100g: Record<string, number | null | undefined>;
    searchName: string;
    sourceFoodCode: string;
  }>(db, COLLECTIONS.BaseFoods);
  const row = await collection.findOne({ sourceFoodCode: foodCode });
  if (!row) return null;

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
    source: "cofid" as const,
  };
}

async function upsertPendingMapping(
  offCandidate: TOpenFoodFactsCandidate,
  genericMatch: TCofidNutrientProfile,
) {
  const db = await getDb();
  const collection = getCollection<TFoodMappingRecord>(db, COLLECTIONS.FoodMappings);
  const now = new Date();

  await collection.updateOne(
    {
      barcode: offCandidate.barcode,
      source: "open_food_facts",
    },
    {
      $set: {
        barcode: offCandidate.barcode,
        brand: offCandidate.brand,
        cofidMatch: {
          foodCode: genericMatch.foodCode,
          foodName: genericMatch.foodName,
        },
        confidence: "medium",
        mappingMethod: "auto_similarity",
        mappingStatus: "pending",
        normalizedName: offCandidate.normalizedName,
        productName: offCandidate.productName,
        source: "open_food_facts",
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true },
  );
}

function normalizeNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
