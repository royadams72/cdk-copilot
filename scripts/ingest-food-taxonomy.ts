import { MongoClient } from "mongodb";
import path from "node:path";
import * as dotenv from "dotenv";
type BaseFood = {
  category?: string;
  description?: string;
  keywords?: string[];
  nutrientsPer100g?: {
    carbs_g?: number;
    energyKcal?: number;
    fat_g?: number;
    phosphorus_mg?: number;
    potassium_mg?: number;
    protein_g?: number;
    sodium_mg?: number;
  };
  searchName?: string;
  source?: string;
  sourceFoodCode?: string;
};

type TaxonomyMajorGroup =
  | "protein"
  | "dairy"
  | "grain"
  | "fruit_veg"
  | "drink"
  | "snack"
  | "condiment"
  | "mixed"
  | "dessert"
  | "other";

type FoodTaxonomyDoc = {
  canonicalName: string;
  createdAt: Date;
  inferredFrom: {
    override?: boolean;
    exactName?: boolean;
    keywordRules?: string[];
    categoryHint?: string | null;
    nutrientTags?: string[];
  };
  majorGroup: TaxonomyMajorGroup;
  normalizedName: string;
  source: string;
  sourceFoodId: string;
  subGroup: string | null;
  swapGroup: string | null;
  taxonomyKey: string;
  tags: string[];
  updatedAt: Date;
};

type TaxonomyResult = Omit<
  FoodTaxonomyDoc,
  | "source"
  | "sourceFoodId"
  | "taxonomyKey"
  | "normalizedName"
  | "canonicalName"
  | "createdAt"
  | "updatedAt"
>;
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
const MONGO_URI = process.env.MONGODB_URI_APP;
const DB_NAME = process.env.DB_NAME || "ckd_copilot";

if (!MONGO_URI) {
  throw new Error("Missing MONGO_URI");
}

/**
 * Manual overrides for high-value or awkward foods.
 * Key by sourceFoodCode where possible.
 */
const FOOD_OVERRIDES: Record<string, Partial<TaxonomyResult>> = {
  "19-504": {
    inferredFrom: { override: true },
    majorGroup: "protein",
    subGroup: "processed_meat",
    swapGroup: "bacon",
    tags: ["animal_protein", "processed_food"],
  },
};

/**
 * If you have reliable meaning for category codes, map them here.
 * Keep this conservative.
 */
const CATEGORY_HINTS: Record<string, Partial<TaxonomyResult>> = {
  // Example placeholders only. Replace when you confirm meanings.
  // 'H': { majorGroup: 'condiment', subGroup: 'herb_spice' },
  // 'DG': { majorGroup: 'fruit_veg', subGroup: 'vegetable_or_plant_food' },
};

const EXACT_NAME_RULES: Array<{
  result: Partial<TaxonomyResult>;
  test: RegExp;
}> = [
  {
    result: {
      majorGroup: "dairy",
      subGroup: "cheese",
      swapGroup: "hard_cheese",
    },
    test: /\bcheddar\b/i,
  },
  {
    result: {
      majorGroup: "dairy",
      subGroup: "cheese",
      swapGroup: "soft_cheese",
    },
    test: /\bcream cheese\b/i,
  },
  {
    result: {
      majorGroup: "dairy",
      subGroup: "cheese",
      swapGroup: "soft_cheese",
    },
    test: /\bricotta\b/i,
  },
  {
    result: {
      majorGroup: "drink",
      subGroup: "soft_drink",
      swapGroup: "cola_soft_drink",
    },
    test: /\bcola\b/i,
  },
  {
    result: {
      majorGroup: "protein",
      subGroup: "processed_meat",
      swapGroup: "bacon",
    },
    test: /\bbacon\b/i,
  },
  {
    result: {
      majorGroup: "protein",
      subGroup: "processed_meat",
      swapGroup: "sausage",
    },
    test: /\bsausage\b/i,
  },
  {
    result: {
      majorGroup: "protein",
      subGroup: "processed_meat",
      swapGroup: "ham",
    },
    test: /\bham\b/i,
  },
  {
    result: {
      majorGroup: "protein",
      subGroup: "poultry",
      swapGroup: "fresh_poultry",
    },
    test: /\bchicken breast\b/i,
  },
  {
    result: {
      majorGroup: "protein",
      subGroup: "egg",
      swapGroup: "egg",
    },
    test: /\begg\b/i,
  },
  {
    result: {
      majorGroup: "dairy",
      subGroup: "milk",
      swapGroup: "milk",
    },
    test: /\bmilk\b/i,
  },
  {
    result: {
      majorGroup: "dairy",
      subGroup: "yoghurt",
      swapGroup: "yoghurt",
    },
    test: /\byoghurt\b|\byogurt\b/i,
  },
  {
    result: {
      majorGroup: "grain",
      subGroup: "bread",
      swapGroup: "bread",
    },
    test: /\bbread\b|\broll\b|\bbaguette\b/i,
  },
  {
    result: {
      majorGroup: "grain",
      subGroup: "rice",
      swapGroup: "rice",
    },
    test: /\brice\b/i,
  },
  {
    result: {
      majorGroup: "grain",
      subGroup: "pasta",
      swapGroup: "pasta",
    },
    test: /\bpasta\b|\bspaghetti\b|\bpenne\b/i,
  },
  {
    result: {
      majorGroup: "drink",
      subGroup: "juice",
      swapGroup: "juice",
    },
    test: /\bapple juice\b|\borange juice\b|\bjuice\b/i,
  },
  {
    result: {
      majorGroup: "snack",
      subGroup: "savoury_snack",
      swapGroup: "crisps",
    },
    test: /\bcrisps\b|\bchips\b/i,
  },
];

const KEYWORD_RULES: Array<{
  all?: string[];
  any?: string[];
  name: string;
  result: Partial<TaxonomyResult>;
}> = [
  {
    any: ["bacon", "rasher", "rashers"],
    name: "processed_meat_bacon",
    result: {
      majorGroup: "protein",
      subGroup: "processed_meat",
      swapGroup: "bacon",
      tags: ["animal_protein", "processed_food"],
    },
  },
  {
    any: ["sausage", "sausages", "hotdog", "salami", "pepperoni"],
    name: "processed_meat_sausage",
    result: {
      majorGroup: "protein",
      subGroup: "processed_meat",
      swapGroup: "processed_meat",
      tags: ["animal_protein", "processed_food"],
    },
  },
  {
    any: ["cheese", "cheddar", "mozzarella", "stilton", "brie", "ricotta"],
    name: "cheese",
    result: {
      majorGroup: "dairy",
      subGroup: "cheese",
      swapGroup: "cheese",
    },
  },
  {
    any: ["milk"],
    name: "milk",
    result: {
      majorGroup: "dairy",
      subGroup: "milk",
      swapGroup: "milk",
    },
  },
  {
    any: ["yoghurt", "yogurt"],
    name: "yoghurt",
    result: {
      majorGroup: "dairy",
      subGroup: "yoghurt",
      swapGroup: "yoghurt",
    },
  },
  {
    any: ["salmon", "tuna", "cod", "haddock", "mackerel", "sardine"],
    name: "fish",
    result: {
      majorGroup: "protein",
      subGroup: "fish",
      swapGroup: "fish",
      tags: ["animal_protein"],
    },
  },
  {
    any: ["chicken", "turkey"],
    name: "poultry",
    result: {
      majorGroup: "protein",
      subGroup: "poultry",
      swapGroup: "fresh_poultry",
      tags: ["animal_protein"],
    },
  },
  {
    any: ["beef", "lamb", "pork", "steak", "mince"],
    name: "red_meat",
    result: {
      majorGroup: "protein",
      subGroup: "red_meat",
      swapGroup: "red_meat",
      tags: ["animal_protein"],
    },
  },
  {
    any: ["beans", "lentils", "chickpeas", "peas"],
    name: "legume",
    result: {
      majorGroup: "protein",
      subGroup: "legume",
      swapGroup: "legume",
      tags: ["plant_protein"],
    },
  },
  {
    any: ["bread", "roll", "bagel", "toast"],
    name: "bread",
    result: {
      majorGroup: "grain",
      subGroup: "bread",
      swapGroup: "bread",
    },
  },
  {
    any: ["cola", "lemonade", "soft drink", "fizzy"],
    name: "soft_drink",
    result: {
      majorGroup: "drink",
      subGroup: "soft_drink",
      swapGroup: "soft_drink",
    },
  },
  {
    any: ["apple", "banana", "orange", "pear", "berries", "grapes"],
    name: "fruit",
    result: {
      majorGroup: "fruit_veg",
      subGroup: "fruit",
      swapGroup: "fruit",
    },
  },
  {
    any: ["carrot", "broccoli", "cabbage", "spinach", "potato", "tomato"],
    name: "vegetable",
    result: {
      majorGroup: "fruit_veg",
      subGroup: "vegetable",
      swapGroup: "vegetable",
    },
  },
  {
    any: ["sauce", "ketchup", "mayo", "mayonnaise", "mustard", "gravy"],
    name: "sauce_or_condiment",
    result: {
      majorGroup: "condiment",
      subGroup: "sauce_condiment",
      swapGroup: "condiment",
    },
  },
];

function normalizeText(value?: string | null): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTaxonomyKey(input: {
  normalizedName: string;
  source: string;
  sourceFoodId: string;
}) {
  const normalizeKeyPart = (value: string) =>
    normalizeText(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
    "unknown";

  return `${normalizeKeyPart(input.source)}::${normalizeKeyPart(
    input.sourceFoodId,
  )}::${normalizeKeyPart(input.normalizedName)}`;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      values
        .filter((v): v is string => Boolean(v && v.trim()))
        .map((v) => v.trim()),
    ),
  ];
}

function mergeTags(...tagLists: Array<string[] | undefined>): string[] {
  return uniqueStrings(tagLists.flatMap((list) => list || []));
}

function applyPartialResult(
  current: Partial<TaxonomyResult>,
  incoming: Partial<TaxonomyResult>,
): Partial<TaxonomyResult> {
  return {
    ...current,
    ...incoming,
    inferredFrom: {
      ...(current.inferredFrom || {}),
      ...(incoming.inferredFrom || {}),
      keywordRules: uniqueStrings([
        ...((current.inferredFrom?.keywordRules || []) as string[]),
        ...((incoming.inferredFrom?.keywordRules || []) as string[]),
      ]),
      nutrientTags: uniqueStrings([
        ...((current.inferredFrom?.nutrientTags || []) as string[]),
        ...((incoming.inferredFrom?.nutrientTags || []) as string[]),
      ]),
    },
    tags: mergeTags(current.tags, incoming.tags),
  };
}

function getTextPool(food: BaseFood): string {
  const joinedKeywords = (food.keywords || []).join(" ");
  return normalizeText(
    `${food.description || ""} ${food.searchName || ""} ${joinedKeywords}`,
  );
}

function inferFromOverride(food: BaseFood): Partial<TaxonomyResult> | null {
  const key = food.sourceFoodCode || "";
  if (!key || !FOOD_OVERRIDES[key]) return null;

  return applyPartialResult(FOOD_OVERRIDES[key], {
    inferredFrom: { override: true },
  });
}

function inferFromExactName(food: BaseFood): Partial<TaxonomyResult> | null {
  const text = `${food.description || ""} ${food.searchName || ""}`;

  for (const rule of EXACT_NAME_RULES) {
    if (rule.test.test(text)) {
      return applyPartialResult(rule.result, {
        inferredFrom: { exactName: true },
      });
    }
  }

  return null;
}

function inferFromKeywords(food: BaseFood): Partial<TaxonomyResult> | null {
  const pool = getTextPool(food);
  const matched: Partial<TaxonomyResult>[] = [];

  for (const rule of KEYWORD_RULES) {
    const anyMatch =
      rule.any && rule.any.some((token) => pool.includes(normalizeText(token)));
    const allMatch =
      rule.all &&
      rule.all.every((token) => pool.includes(normalizeText(token)));

    if (anyMatch || allMatch) {
      matched.push(
        applyPartialResult(rule.result, {
          inferredFrom: { keywordRules: [rule.name] },
        }),
      );
    }
  }

  if (!matched.length) return null;

  return matched.reduce((acc, item) => applyPartialResult(acc, item), {});
}

function inferFromCategory(food: BaseFood): Partial<TaxonomyResult> | null {
  const category = (food.category || "").trim();
  if (!category || !CATEGORY_HINTS[category]) return null;

  return applyPartialResult(CATEGORY_HINTS[category], {
    inferredFrom: { categoryHint: category },
  });
}

function inferNutrientTags(food: BaseFood): Partial<TaxonomyResult> | null {
  const n = food.nutrientsPer100g || {};
  const tags: string[] = [];
  const nutrientTags: string[] = [];

  if (typeof n.protein_g === "number" && n.protein_g >= 20) {
    tags.push("high_protein");
    nutrientTags.push("high_protein");
  }

  if (typeof n.phosphorus_mg === "number" && n.phosphorus_mg >= 200) {
    tags.push("phosphorus_dense");
    nutrientTags.push("phosphorus_dense");
  }

  if (typeof n.potassium_mg === "number" && n.potassium_mg >= 300) {
    tags.push("potassium_dense");
    nutrientTags.push("potassium_dense");
  }

  if (typeof n.sodium_mg === "number" && n.sodium_mg >= 400) {
    tags.push("high_sodium");
    nutrientTags.push("high_sodium");
  }

  if (!tags.length) return null;

  return {
    inferredFrom: {
      nutrientTags,
    },
    tags,
  };
}

function fallbackTaxonomy(food: BaseFood): Partial<TaxonomyResult> {
  const text = getTextPool(food);

  if (
    text.includes("cake") ||
    text.includes("biscuit") ||
    text.includes("pudding")
  ) {
    return {
      inferredFrom: {},
      majorGroup: "dessert",
      subGroup: "sweet_food",
      swapGroup: "dessert",
      tags: [],
    };
  }

  if (
    text.includes("sandwich") ||
    text.includes("pizza") ||
    text.includes("lasagne") ||
    text.includes("curry")
  ) {
    return {
      inferredFrom: {},
      majorGroup: "mixed",
      subGroup: "mixed_dish",
      swapGroup: null,
      tags: [],
    };
  }

  return {
    inferredFrom: {},
    majorGroup: "other",
    subGroup: null,
    swapGroup: null,
    tags: [],
  };
}

function inferTaxonomy(food: BaseFood): TaxonomyResult {
  let result: Partial<TaxonomyResult> = {};

  const override = inferFromOverride(food);
  if (override) {
    result = applyPartialResult(result, override);
  }

  const exact = inferFromExactName(food);
  if (exact) {
    result = applyPartialResult(result, exact);
  }

  const keyword = inferFromKeywords(food);
  if (keyword) {
    result = applyPartialResult(result, keyword);
  }

  const category = inferFromCategory(food);
  if (category) {
    result = applyPartialResult(result, category);
  }

  const nutrientTags = inferNutrientTags(food);
  if (nutrientTags) {
    result = applyPartialResult(result, nutrientTags);
  }

  result = applyPartialResult(result, fallbackTaxonomy(food));

  return {
    inferredFrom: {
      override: result.inferredFrom?.override || false,
      exactName: result.inferredFrom?.exactName || false,
      keywordRules: uniqueStrings(result.inferredFrom?.keywordRules || []),
      categoryHint: result.inferredFrom?.categoryHint || null,
      nutrientTags: uniqueStrings(result.inferredFrom?.nutrientTags || []),
    },
    majorGroup: (result.majorGroup || "other") as TaxonomyMajorGroup,
    subGroup: result.subGroup ?? null,
    swapGroup: result.swapGroup ?? null,
    tags: uniqueStrings(result.tags || []),
  };
}

async function main() {
  const client = new MongoClient(MONGO_URI!);

  try {
    await client.connect();

    const db = client.db(DB_NAME);
    const baseFoods = db.collection<BaseFood>("base_foods");
    const taxonomy = db.collection<FoodTaxonomyDoc>("food_taxonomy");

    await taxonomy.createIndex(
      { taxonomyKey: 1 },
      { name: "uniqTaxonomyKey", unique: true },
    );
    await taxonomy.createIndex(
      { source: 1, sourceFoodId: 1 },
      { name: "bySourceAndSourceFoodId" },
    );

    await taxonomy.createIndex(
      { majorGroup: 1, subGroup: 1, swapGroup: 1 },
      { name: "byMajorSubSwap" },
    );

    await taxonomy.createIndex({ tags: 1 }, { name: "byTags" });

    const cursor = baseFoods.find(
      { source: "cofid" },
      {
        projection: {
          _id: 1,
          category: 1,
          description: 1,
          keywords: 1,
          nutrientsPer100g: 1,
          searchName: 1,
          source: 1,
          sourceFoodCode: 1,
        },
      },
    );

    const ops: Array<Promise<unknown>> = [];
    let processed = 0;

    for await (const food of cursor) {
      const inferred = inferTaxonomy(food);
      const now = new Date();
      const canonicalName = food.description || food.searchName || "Unknown food";
      const normalizedName = normalizeText(canonicalName);
      const source = food.source || "cofid";
      const sourceFoodId = food.sourceFoodCode || normalizedName;
      const taxonomyKey = buildTaxonomyKey({
        normalizedName,
        source,
        sourceFoodId,
      });

      const doc: FoodTaxonomyDoc = {
        canonicalName,
        createdAt: now,
        inferredFrom: inferred.inferredFrom,
        majorGroup: inferred.majorGroup,
        normalizedName,
        source,
        sourceFoodId,
        subGroup: inferred.subGroup,
        swapGroup: inferred.swapGroup,
        taxonomyKey,
        tags: inferred.tags,
        updatedAt: now,
      };

      ops.push(
        taxonomy.updateOne(
          { taxonomyKey: doc.taxonomyKey },
          {
            $set: {
              source: doc.source,
              sourceFoodId: doc.sourceFoodId,
              taxonomyKey: doc.taxonomyKey,
              canonicalName: doc.canonicalName,
              normalizedName: doc.normalizedName,
              majorGroup: doc.majorGroup,
              subGroup: doc.subGroup,
              swapGroup: doc.swapGroup,
              tags: doc.tags,
              inferredFrom: doc.inferredFrom,
              updatedAt: now,
            },
            $setOnInsert: {
              createdAt: now,
            },
          },
          { upsert: true },
        ),
      );

      processed++;

      if (ops.length >= 500) {
        await Promise.all(ops);
        ops.length = 0;
        console.log(`Processed ${processed} foods`);
      }
    }

    if (ops.length) {
      await Promise.all(ops);
    }

    console.log(`Done. Processed ${processed} CoFID foods.`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
