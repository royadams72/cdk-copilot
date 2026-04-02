import type {
  TFoodSearchCandidate,
  TSearchFoodNutrients,
} from "@/packages/core/src/isomorphic/schemas/food_search";

const OFF_APP_NAME = process.env.OPEN_FOOD_FACTS_APP_NAME ?? "ckd-copilot";
const OFF_BASE_URLS = process.env.OPEN_FOOD_FACTS_BASE_URL
  ? [process.env.OPEN_FOOD_FACTS_BASE_URL]
  : ["https://world.openfoodfacts.net", "https://world.openfoodfacts.org"];

const OFF_FIELDS = [
  "brands",
  "brands_tags",
  "categories",
  "categories_tags",
  "code",
  "countries",
  "countries_tags",
  "data_quality_errors_tags",
  "image_front_small_url",
  "nutriments",
  "product_name",
  "product_name_en",
  "quantity",
  "serving_size",
].join(",");

export async function searchOpenFoodFacts(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TFoodSearchCandidate[]> {
  const params = new URLSearchParams({
    action: "process",
    app_name: OFF_APP_NAME,
    fields: OFF_FIELDS,
    json: "1",
    page_size: "20",
    search_simple: "1",
    search_terms: query,
  });
  let lastError: Error | null = null;

  for (const baseUrl of OFF_BASE_URLS) {
    try {
      const response = await fetchImpl(`${baseUrl}/cgi/search.pl?${params.toString()}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": `${OFF_APP_NAME}/1.0`,
        },
      });

      if (!response.ok) {
        if (response.status >= 500) {
          lastError = new Error(
            `Open Food Facts search failed on ${baseUrl} (${response.status})`,
          );
          continue;
        }
        throw new Error(`Open Food Facts search failed (${response.status})`);
      }

      const payload = (await response.json()) as {
        products?: Array<Record<string, unknown>>;
      };

      return (payload.products ?? [])
        .map(toOpenFoodFactsCandidate)
        .filter((candidate): candidate is TFoodSearchCandidate => candidate !== null);
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("Open Food Facts search failed");
    }
  }

  throw lastError ?? new Error("Open Food Facts search failed");
}

function toOpenFoodFactsCandidate(
  product: Record<string, unknown>,
): TFoodSearchCandidate | null {
  const productName = getString(product.product_name_en) ?? getString(product.product_name);
  if (!productName) return null;

  const brand = getString(product.brands)?.split(",")[0]?.trim() || undefined;
  const barcode = getString(product.code) ?? undefined;
  const nutriments = (product.nutriments ?? {}) as Record<string, unknown>;

  return {
    food: {
      brand,
      category: "packaged-foods",
      categoryLabel: "food",
      foodId: barcode ?? normalizeText([brand, productName].filter(Boolean).join(" ")),
      image: getString(product.image_front_small_url) ?? undefined,
      knownAs: productName,
      label: productName,
      nutrients: mapNutrients(nutriments),
    },
    measures: [],
    metadata: {
      barcode,
      imageUrl: getString(product.image_front_small_url) ?? undefined,
      servingSize: getString(product.serving_size) ?? undefined,
      ukMarketMatch: isUkRelevant(product),
    },
    provider: "open_food_facts",
  };
}

function mapNutrients(nutriments: Record<string, unknown>): TSearchFoodNutrients {
  return compact({
    caloriesKcal: getNumber(nutriments["energy-kcal_100g"] ?? nutriments.energy_kcal_100g),
    carbsG: getNumber(nutriments.carbohydrates_100g),
    fatG: getNumber(nutriments.fat_100g),
    fiberG: getNumber(nutriments.fiber_100g),
    phosphorusMg: getNumber(nutriments.phosphorus_100g),
    potassiumMg: getNumber(nutriments.potassium_100g),
    proteinG: getNumber(nutriments.proteins_100g),
    sodiumMg: gramsToMilligrams(getNumber(nutriments.sodium_100g)),
  });
}

function isUkRelevant(product: Record<string, unknown>) {
  const countries = toStringArray(product.countries_tags, product.countries).join(" ").toLowerCase();
  const brand = getString(product.brands)?.toLowerCase() ?? "";
  return /\buk\b|\bunited kingdom\b|\bgreat britain\b|\bengland\b|\bscotland\b|\bwales\b/.test(
    countries,
  ) || /\btesco\b|\basda\b|\bsainsbury'?s\b|\bmorrisons\b|\bwaitrose\b|\bcoop\b/.test(brand);
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function toStringArray(...values: unknown[]) {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry)).filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      return value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function gramsToMilligrams(value: number | undefined) {
  return typeof value === "number" ? value * 1000 : undefined;
}

function compact<T extends Record<string, number | undefined>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
