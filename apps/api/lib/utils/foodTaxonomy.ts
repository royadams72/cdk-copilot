import {
  FoodTaxonomyDocument,
  FoodTaxonomySnapshot,
  TFoodItemEntry,
  TFoodTaxonomyDocument,
  TFoodTaxonomySnapshot,
  TFoodTaxonomySource,
  TTaxonomyMajorGroup,
} from "@ckd/core";
import { COLLECTIONS, getCollection } from "@ckd/core/server";
import type { Db } from "mongodb";

type TaxonomyRuleResult = {
  inferredFrom?: Partial<TFoodTaxonomySnapshot["inferredFrom"]>;
  majorGroup?: TTaxonomyMajorGroup;
  subGroup?: string | null;
  swapGroup?: string | null;
  tags?: string[];
};

type KeywordRule = {
  all?: string[];
  any?: string[];
  name: string;
  result: TaxonomyRuleResult;
};
const NUT_BUTTER_REGEX = new RegExp(
  "\\b(peanut butter|almond butter|cashew butter|hazelnut butter|pistachio butter|mixed nut butter|nut butter|(peanut|almond|cashew|hazelnut|pistachio|nut)\\s+butter)\\b",
  "i",
);
const NUTS_AND_SEEDS_REGEX =
  /\b(peanut|peanuts|almond|almonds|cashew|cashews|walnut|walnuts|hazelnut|hazelnuts|pistachio|pistachios|mixed nuts)\b/i;

function detectNutButter(name: string) {
  if (!name) return false;
  return NUT_BUTTER_REGEX.test(name.toLowerCase());
}
function detectNutsAndSeeds(name: string) {
  if (!name) return false;
  return NUTS_AND_SEEDS_REGEX.test(name.toLowerCase());
}

const EXACT_NAME_RULES: Array<{ result: TaxonomyRuleResult; test: RegExp }> = [
  {
    result: {
      majorGroup: "dairy",
      subGroup: "cheese",
      swapGroup: "hard_cheese",
      tags: ["dairy"],
    },
    test: /\bcheddar\b|\bparmesan\b|\bred leicester\b|\bstilton\b/i,
  },
  {
    result: {
      majorGroup: "dairy",
      subGroup: "soft_cheese",
      swapGroup: "soft_cheese",
      tags: ["dairy"],
    },
    test: /\bcream cheese\b|\bricotta\b|\bcottage cheese\b/i,
  },
  {
    result: {
      majorGroup: "protein",
      subGroup: "processed_meat",
      swapGroup: "bacon",
      tags: ["animal_protein", "processed_food"],
    },
    test: /\bbacon\b/i,
  },
  {
    result: {
      majorGroup: "protein",
      subGroup: "processed_meat",
      swapGroup: "sausage",
      tags: ["animal_protein", "processed_food"],
    },
    test: /\bsausage\b|\bsausages\b/i,
  },
  {
    result: {
      majorGroup: "protein",
      subGroup: "shellfish",
      swapGroup: "shellfish",
      tags: ["animal_protein"],
    },
    test: /\bprawn\b|\bprawns\b|\bshrimp\b/i,
  },
  {
    result: {
      majorGroup: "protein",
      subGroup: "poultry",
      swapGroup: "fresh_poultry",
      tags: ["animal_protein"],
    },
    test: /\bchicken\b|\bturkey\b/i,
  },
  {
    result: {
      majorGroup: "protein",
      subGroup: "fish",
      swapGroup: "fresh_fish",
      tags: ["animal_protein"],
    },
    test: /\bsalmon\b|\btuna\b|\bcod\b|\bhaddock\b/i,
  },
  {
    result: {
      majorGroup: "protein",
      subGroup: "egg",
      swapGroup: "egg",
      tags: ["animal_protein"],
    },
    test: /\begg\b/i,
  },
  {
    result: {
      majorGroup: "grain",
      subGroup: "pasta",
      swapGroup: "pasta",
    },
    test: /\bpasta\b|\bspaghetti\b|\bpenne\b|\bmacaroni\b/i,
  },
  {
    result: {
      majorGroup: "grain",
      subGroup: "bread",
      swapGroup: "nuts_and_seeds",
    },
    test: /\bbread\b|\broll\b|\btoast\b|\bbagel\b/i,
  },
  {
    result: {
      majorGroup: "grain",
      subGroup: "bread",
      swapGroup: "bread",
    },
    test: /\bbread\b|\broll\b|\btoast\b|\bbagel\b/i,
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
      majorGroup: "drink",
      subGroup: "soft_drink",
      swapGroup: "cola_soft_drink",
      tags: ["sweetened_drink"],
    },
    test: /\bcola\b/i,
  },
  {
    result: {
      majorGroup: "drink",
      subGroup: "soft_drink",
      swapGroup: "soft_drink",
      tags: ["sweetened_drink"],
    },
    test: /\blemonade\b|\bsoft drink\b|\bfizzy drink\b|\bsoda\b/i,
  },
  {
    result: {
      majorGroup: "snack",
      subGroup: "savoury_snack",
      swapGroup: "crisps",
    },
    test: /\bcrisps\b|\bpotato chips\b/i,
  },
];

const KEYWORD_RULES: KeywordRule[] = [
  {
    any: ["apple", "banana", "orange", "pear", "berries", "grapes", "fruit"],
    name: "fruit",
    result: {
      majorGroup: "fruit_veg",
      subGroup: "fruit",
      swapGroup: "fruit",
    },
  },
  {
    any: [
      "broccoli",
      "carrot",
      "spinach",
      "cabbage",
      "vegetable",
      "veg",
      "salad",
      "tomato",
    ],
    name: "vegetable",
    result: {
      majorGroup: "fruit_veg",
      subGroup: "vegetable",
      swapGroup: "vegetable",
    },
  },
  {
    any: ["sandwich", "pizza", "lasagne", "curry"],
    name: "mixed_dish",
    result: {
      majorGroup: "mixed",
      subGroup: "mixed_dish",
      swapGroup: "mixed_meal",
    },
  },
  {
    any: ["cake", "biscuit", "pudding", "ice cream"],
    name: "dessert",
    result: {
      majorGroup: "dessert",
      subGroup: "sweet_food",
      swapGroup: "dessert",
    },
  },
];

const DEFAULT_SWAP_GROUP_BY_SUBGROUP: Partial<Record<string, string>> = {
  bread: "bread",
  fish: "fresh_fish",
  fruit: "fruit",
  pasta: "pasta",
  poultry: "fresh_poultry",
  rice: "rice",
  soft_drink: "soft_drink",
  vegetable: "vegetable",
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return [
    ...new Set(
      values
        .filter((value): value is string => Boolean(value && value.trim()))
        .map((value) => value.trim()),
    ),
  ];
}

function toFoodTaxonomyDocument(value: Record<string, unknown>) {
  const { _id: _ignored, ...doc } = value;
  return FoodTaxonomyDocument.parse(doc);
}

function toFoodTaxonomySnapshot(
  doc: TFoodTaxonomyDocument,
): TFoodTaxonomySnapshot {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...snapshot } = doc;
  return FoodTaxonomySnapshot.parse(snapshot);
}

function mergeRuleResults(
  current: TaxonomyRuleResult,
  incoming: TaxonomyRuleResult | null,
): TaxonomyRuleResult {
  if (!incoming) return current;
  return {
    ...incoming,
    ...current,
    inferredFrom: {
      ...(incoming.inferredFrom ?? {}),
      ...(current.inferredFrom ?? {}),
      keywordRules: uniqueStrings([
        ...((incoming.inferredFrom?.keywordRules as string[] | undefined) ??
          []),
        ...((current.inferredFrom?.keywordRules as string[] | undefined) ?? []),
      ]),
      nutrientTags: uniqueStrings([
        ...((incoming.inferredFrom?.nutrientTags as string[] | undefined) ??
          []),
        ...((current.inferredFrom?.nutrientTags as string[] | undefined) ?? []),
      ]),
    },
    majorGroup: current.majorGroup ?? incoming.majorGroup,
    subGroup:
      current.subGroup !== undefined ? current.subGroup : incoming.subGroup,
    swapGroup:
      current.swapGroup !== undefined ? current.swapGroup : incoming.swapGroup,
    tags: uniqueStrings([...(current.tags ?? []), ...(incoming.tags ?? [])]),
  };
}

function shouldRepairExistingTaxonomy(
  existing: TFoodTaxonomyDocument,
  inferred: TFoodTaxonomySnapshot,
) {
  if (existing.inferredFrom.override) {
    return false;
  }

  return (
    (existing.majorGroup === "other" && inferred.majorGroup !== "other") ||
    (!existing.subGroup && !!inferred.subGroup) ||
    (!existing.swapGroup && !!inferred.swapGroup)
  );
}

function getTextPool(item: Pick<TFoodItemEntry, "name">) {
  return normalizeFoodName(item.name);
}

function inferFromExactName(
  item: Pick<TFoodItemEntry, "name">,
): TaxonomyRuleResult | null {
  const text = item.name ?? "";
  if (detectNutButter(text)) {
    return mergeRuleResults(
      {
        majorGroup: "protein",
        subGroup: "spread",
        swapGroup: "nut_butter",
        tags: ["high_fat", "phosphorus_dense"],
      },
      {
        inferredFrom: { exactName: true },
      },
    );
  }
  if (detectNutsAndSeeds(text)) {
    return mergeRuleResults(
      {
        majorGroup: "protein",
        subGroup: "nuts_and_seeds",
        swapGroup: "nuts_and_seeds",
        tags: ["high_fat", "phosphorus_dense"],
      },
      {
        inferredFrom: { exactName: true },
      },
    );
  }
  for (const rule of EXACT_NAME_RULES) {
    if (rule.test.test(text)) {
      return mergeRuleResults(rule.result, {
        inferredFrom: { exactName: true },
      });
    }
  }
  return null;
}

function inferFromKeywords(
  item: Pick<TFoodItemEntry, "name">,
): TaxonomyRuleResult | null {
  const pool = getTextPool(item);
  let result: TaxonomyRuleResult = {};

  for (const rule of KEYWORD_RULES) {
    const anyMatch =
      rule.any &&
      rule.any.some((token) => pool.includes(normalizeFoodName(token)));
    const allMatch =
      rule.all &&
      rule.all.every((token) => pool.includes(normalizeFoodName(token)));

    if (anyMatch || allMatch) {
      result = mergeRuleResults(result, {
        ...rule.result,
        inferredFrom: { keywordRules: [rule.name] },
      });
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

function inferNutrientTags(
  item: Pick<TFoodItemEntry, "nutrients">,
): TaxonomyRuleResult | null {
  const nutrientTags: string[] = [];
  const tags: string[] = [];
  const nutrients = item.nutrients ?? {};

  if (typeof nutrients.proteinG === "number" && nutrients.proteinG >= 20) {
    nutrientTags.push("high_protein");
    tags.push("high_protein");
  }
  if (
    typeof nutrients.phosphorusMg === "number" &&
    nutrients.phosphorusMg >= 200
  ) {
    nutrientTags.push("phosphorus_dense");
    tags.push("phosphorus_dense");
  }
  if (
    typeof nutrients.potassiumMg === "number" &&
    nutrients.potassiumMg >= 300
  ) {
    nutrientTags.push("potassium_dense");
    tags.push("potassium_dense");
  }
  if (typeof nutrients.sodiumMg === "number" && nutrients.sodiumMg >= 400) {
    nutrientTags.push("high_sodium");
    tags.push("high_sodium");
  }

  if (nutrientTags.length === 0) {
    return null;
  }

  return {
    inferredFrom: { nutrientTags },
    tags,
  };
}

function fallbackRule(item: Pick<TFoodItemEntry, "name">): TaxonomyRuleResult {
  const text = getTextPool(item);

  if (
    text.includes("cake") ||
    text.includes("biscuit") ||
    text.includes("pudding") ||
    text.includes("ice cream")
  ) {
    return {
      majorGroup: "dessert",
      subGroup: "sweet_food",
      swapGroup: "dessert",
    };
  }

  if (
    text.includes("sandwich") ||
    text.includes("pizza") ||
    text.includes("lasagne") ||
    text.includes("curry")
  ) {
    return {
      majorGroup: "mixed",
      subGroup: "mixed_dish",
      swapGroup: "mixed_meal",
    };
  }

  return {
    majorGroup: "other",
    subGroup: null,
    swapGroup: null,
  };
}

export function normalizeFoodName(value?: string | null) {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeKeyPart(value?: string | null) {
  const normalized = normalizeFoodName(value);
  return (
    normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown"
  );
}

export function buildFoodTaxonomyKey(input: {
  normalizedName: string;
  source: string;
  sourceFoodId: string;
}) {
  return `${normalizeKeyPart(input.source)}::${normalizeKeyPart(
    input.sourceFoodId,
  )}::${normalizeKeyPart(input.normalizedName)}`;
}

export function deriveTaxonomySource(
  item: Pick<TFoodItemEntry, "source" | "nutrients">,
): TFoodTaxonomySource {
  const nutrientSource = normalizeFoodName(item.nutrients?.source);
  if (nutrientSource.includes("edamam")) return "edamam";
  if (item.source === "api") return "edamam";
  if (item.source === "barcode") return "barcode";
  if (item.source === "image_ai") return "image_ai";
  if (item.source === "user") return "user";
  return "unknown";
}

export function inferFoodTaxonomy(
  item: Pick<
    TFoodItemEntry,
    "foodId" | "name" | "nutrients" | "source" | "uid"
  >,
): TFoodTaxonomySnapshot {
  const canonicalName = item.name?.trim() || "Food item";
  const normalizedName = normalizeFoodName(canonicalName);
  const source = deriveTaxonomySource(item);
  const sourceFoodId =
    item.foodId?.trim() || item.uid?.trim() || normalizeKeyPart(canonicalName);

  let result: TaxonomyRuleResult = {};
  result = mergeRuleResults(result, inferFromExactName(item));
  result = mergeRuleResults(result, inferFromKeywords(item));
  result = mergeRuleResults(result, inferNutrientTags(item));
  result = mergeRuleResults(result, fallbackRule(item));

  const subGroup = result.subGroup ?? null;
  const swapGroup =
    result.swapGroup ??
    (subGroup ? (DEFAULT_SWAP_GROUP_BY_SUBGROUP[subGroup] ?? subGroup) : null);

  return {
    canonicalName,
    inferredFrom: {
      override: result.inferredFrom?.override ?? false,
      exactName: result.inferredFrom?.exactName ?? false,
      keywordRules: uniqueStrings(
        (result.inferredFrom?.keywordRules as string[] | undefined) ?? [],
      ),
      categoryHint: result.inferredFrom?.categoryHint ?? null,
      nutrientTags: uniqueStrings(
        (result.inferredFrom?.nutrientTags as string[] | undefined) ?? [],
      ),
    },
    majorGroup: result.majorGroup ?? "other",
    normalizedName,
    source,
    sourceFoodId,
    subGroup,
    swapGroup,
    tags: uniqueStrings(result.tags ?? []),
    taxonomyKey: buildFoodTaxonomyKey({
      normalizedName,
      source,
      sourceFoodId,
    }),
  };
}

export async function getOrCreateFoodTaxonomy(
  db: Db,
  item: Pick<
    TFoodItemEntry,
    "foodId" | "name" | "nutrients" | "source" | "uid"
  >,
): Promise<TFoodTaxonomyDocument> {
  const collection = getCollection<TFoodTaxonomyDocument>(
    db,
    COLLECTIONS.FoodTaxonomy,
  );
  const inferred = inferFoodTaxonomy(item);
  const existing = await collection.findOne({
    taxonomyKey: inferred.taxonomyKey,
  });
  if (existing) {
    const parsedExisting = toFoodTaxonomyDocument(
      existing as Record<string, unknown>,
    );

    if (!shouldRepairExistingTaxonomy(parsedExisting, inferred)) {
      return parsedExisting;
    }

    const now = new Date();
    await collection.updateOne(
      { taxonomyKey: inferred.taxonomyKey },
      {
        $set: {
          ...inferred,
          createdAt: parsedExisting.createdAt,
          updatedAt: now,
        },
      },
    );

    return {
      ...parsedExisting,
      ...inferred,
      updatedAt: now,
    };
  }

  const now = new Date();
  await collection.updateOne(
    { taxonomyKey: inferred.taxonomyKey },
    {
      $set: {
        ...inferred,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true },
  );

  const persisted = await collection.findOne({
    taxonomyKey: inferred.taxonomyKey,
  });
  return toFoodTaxonomyDocument({
    ...inferred,
    createdAt: now,
    updatedAt: now,
    ...(persisted ?? {}),
  });
}

export async function attachFoodTaxonomies(
  db: Db,
  items: TFoodItemEntry[],
): Promise<TFoodItemEntry[]> {
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      taxonomy: toFoodTaxonomySnapshot(await getOrCreateFoodTaxonomy(db, item)),
    })),
  );
}
