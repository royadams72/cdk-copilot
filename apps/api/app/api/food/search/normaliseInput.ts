import OpenAI from "openai";

import { TLogMealItem, TLogMealNormalised } from "@ckd/core";

const OPENAI_CACHE_TTL_MS = 60 * 60 * 1000;
const OPENAI_CACHE_MAX_ENTRIES = 500;
const OPENAI_BREAKER_THRESHOLD = 2;
const OPENAI_BREAKER_COOLDOWN_MS = 10 * 60 * 1000;
const OPENAI_METRIC_LOG_INTERVAL = 50;

const normaliseCache = new Map<
  string,
  { expiresAt: number; value: TLogMealNormalised }
>();

const normaliseMetrics = {
  cacheHit: 0,
  fallbackReturned: 0,
  openaiAttempted: 0,
  openaiQuotaFailure: 0,
  openaiSkippedCircuitOpen: 0,
  openaiSkippedNoKey: 0,
  openaiSuccess: 0,
  ruleBased: 0,
  total: 0,
};

let consecutiveQuotaFailures = 0;
let openAIDisabledUntil = 0;

export async function normaliseInput(input: string): Promise<TLogMealNormalised> {
  normaliseMetrics.total += 1;
  const cacheKey = buildCacheKey(input);
  const cached = readCachedNormalisation(cacheKey);
  if (cached) {
    normaliseMetrics.cacheHit += 1;
    maybeLogNormalisationMetrics();
    return cached;
  }

  const directBreadMatch = buildDirectBreadNormalisation(input);
  if (directBreadMatch) {
    normaliseMetrics.ruleBased += 1;
    writeCachedNormalisation(cacheKey, directBreadMatch);
    maybeLogNormalisationMetrics();
    return directBreadMatch;
  }

  const ruleBased = buildRuleBasedNormalisation(input);
  if (ruleBased) {
    normaliseMetrics.ruleBased += 1;
    writeCachedNormalisation(cacheKey, ruleBased);
    maybeLogNormalisationMetrics();
    return ruleBased;
  }

  const fallback = buildFallbackNormalisation(input);
  if (!process.env.OPENAI_API_KEY) {
    normaliseMetrics.openaiSkippedNoKey += 1;
    normaliseMetrics.fallbackReturned += 1;
    maybeLogNormalisationMetrics();
    return fallback;
  }

  if (!shouldUseOpenAINormalisation(input)) {
    normaliseMetrics.fallbackReturned += 1;
    maybeLogNormalisationMetrics();
    return fallback;
  }

  if (isOpenAICircuitOpen()) {
    normaliseMetrics.openaiSkippedCircuitOpen += 1;
    normaliseMetrics.fallbackReturned += 1;
    maybeLogNormalisationMetrics();
    return fallback;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const normalise = `Normalise this meal description into the JSON format described above. "${input}"`;
  try {
    normaliseMetrics.openaiAttempted += 1;
    const completion = await openai.chat.completions.create({
      messages: [
        {
          content: aiPrompt,
          role: "developer",
        },
        {
          content: normalise,
          role: "user",
        },
      ],
      model: "gpt-3.5-turbo",
      store: true,
    });

    const plan = completion.choices[0]?.message?.content;
    if (!plan) {
      normaliseMetrics.fallbackReturned += 1;
      maybeLogNormalisationMetrics();
      return fallback;
    }

    const json = JSON.parse(stripMarkdownCodeFence(plan)) as TLogMealNormalised;
    if (!Array.isArray(json?.items) || json.items.length === 0) {
      normaliseMetrics.fallbackReturned += 1;
      maybeLogNormalisationMetrics();
      return fallback;
    }

    consecutiveQuotaFailures = 0;
    normaliseMetrics.openaiSuccess += 1;
    writeCachedNormalisation(cacheKey, json);
    maybeLogNormalisationMetrics();
    return json;
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? (error as { status?: number }).status
        : undefined;
    const message = error instanceof Error ? error.message : String(error);
    const isQuotaIssue =
      status === 429 || /quota|rate limit|too many requests/i.test(message);

    if (isQuotaIssue) {
      normaliseMetrics.openaiQuotaFailure += 1;
      consecutiveQuotaFailures += 1;
      if (consecutiveQuotaFailures >= OPENAI_BREAKER_THRESHOLD) {
        openAIDisabledUntil = Date.now() + OPENAI_BREAKER_COOLDOWN_MS;
        consecutiveQuotaFailures = 0;
        console.warn("food/search normaliseInput circuit open", {
          cooldownMs: OPENAI_BREAKER_COOLDOWN_MS,
          disabledUntil: new Date(openAIDisabledUntil).toISOString(),
        });
      }
    } else {
      consecutiveQuotaFailures = 0;
    }

    const logger = isQuotaIssue ? console.warn : console.error;
    logger("food/search normaliseInput failed", {
      error: error instanceof Error ? error.message : String(error),
      input,
    });
    normaliseMetrics.fallbackReturned += 1;
    maybeLogNormalisationMetrics();
    return fallback;
  }
}

const aiPrompt = `You are a nutrition parsing assistant.

Your job is to take a free-text description of everything a person ate or drank, and normalise it into a list of ingredient items suitable for a nutrition database API.

Rules:
- Work at the level of individual ingredients or simple combined items (e.g. "ham sandwich" becomes "ham slices" as an item in items array and "white bread slices" as an item in items array, "chicken curry with rice" becomes "chicken curry" as an item in items array and "white rice" as an item in items array).
- Infer sensible quantities and units if missing (e.g. "a bowl of cereal" → 1 bowl cereal).
- Use everyday measures when possible: slice, cup, tablespoon, teaspoon, piece, can, bottle, gram, milliliter, ounce.
- Keep each ingredient's "normalized" text short but specific enough for a food database search.
- Preserve explicit product descriptors that help search quality, including variety/type words such as "basmati", "wholemeal", "seeded", and "reduced salt".
- Preserve explicit brand names when the user typed them (e.g. "Birds Eye peas" should stay branded rather than being reduced to just "peas").
- Do not invent brand names if the user did not provide one.
- If something is too vague to be logged (e.g. “a snack”), omit it.
- Return ONLY valid JSON. Do not include any explanation, comments, or extra text.

Output JSON schema:
{
  "mealText": string,        // original user input
  "items": [
    {
      "original": string,    // exact fragment from the user text
      "normalised": string,  // cleaned phrase to send to a food database parser
      "quantity": number,    // numeric quantity (use 1 if unknown but clearly singular)
      "unit": string | null, // normalized unit like "slice", "cup", "tablespoon", or null if truly unitless
      "food": string         // core food name (no quantities or units)
    }
  ]
}`;

function buildDirectBreadNormalisation(
  input: string,
): TLogMealNormalised | null {
  const cleaned = input.toLowerCase().trim().replace(/\s+/g, " ");
  if (!cleaned) return null;

  const isBreadStyleQuery =
    /^(brown|wholemeal|whole meal|wholegrain|whole grain|wholewheat|whole wheat|granary)( bread)?$/.test(
      cleaned,
    );

  if (!isBreadStyleQuery) return null;

  return {
    items: [
      {
        food: "whole wheat bread",
        normalised: "whole wheat bread",
        original: input,
        quantity: 1,
        unit: "slice",
      },
    ],
    mealText: input,
  };
}

function buildFallbackNormalisation(input: string): TLogMealNormalised {
  const trimmed = input.trim().replace(/\s+/g, " ");

  return {
    items: [
      {
        food: trimmed,
        normalised: trimmed.toLowerCase(),
        original: input,
        quantity: 1,
        unit: null,
      },
    ],
    mealText: input,
  };
}

function buildRuleBasedNormalisation(
  input: string,
): TLogMealNormalised | null {
  const parsedItems = parseRuleBasedItems(input);
  if (!parsedItems.length) return null;

  return {
    items: parsedItems,
    mealText: input,
  };
}

function parseRuleBasedItems(input: string): TLogMealItem[] {
  const directSegments = splitMeasuredSegments(input);
  if (directSegments.length > 1) {
    const parsed = directSegments
      .map((segment) => parseMeasuredFoodItem(segment))
      .filter((item): item is TLogMealItem => item !== null);
    if (parsed.length === directSegments.length) {
      return parsed;
    }
  }

  const singleMeasured = parseMeasuredFoodItem(input);
  if (singleMeasured) {
    return [singleMeasured];
  }

  const singleSimple = parseSimpleFoodNameItem(input);
  if (singleSimple) {
    return [singleSimple];
  }

  return [];
}

function splitMeasuredSegments(input: string): string[] {
  const trimmed = cleanFoodText(input);
  if (!trimmed) return [];

  const baseSegments = trimmed
    .split(/\s*(?:,|;|\bthen\b)\s*/i)
    .map((segment) => cleanFoodText(segment))
    .filter(Boolean);

  if (baseSegments.length > 1) {
    return baseSegments;
  }

  const andSegments = trimmed
    .split(/\s+\band\b\s+/i)
    .map((segment) => cleanFoodText(segment))
    .filter(Boolean);

  if (
    andSegments.length > 1 &&
    andSegments.every((segment) => matchesMeasuredFoodPattern(segment))
  ) {
    return andSegments;
  }

  return [trimmed];
}

function parseMeasuredFoodItem(input: string): TLogMealItem | null {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;

  const match = trimmed.match(measuredFoodPattern);

  if (!match?.groups) return null;

  const quantity = parseQuantity(match.groups.quantity);
  const rawFood = cleanFoodText(match.groups.food);
  if (!quantity || !rawFood || !looksSimpleFood(rawFood)) {
    return null;
  }

  const normalizedFood = rawFood.toLowerCase();

  return {
    food: normalizedFood,
    normalised: normalizedFood,
    original: input,
    quantity,
    unit: normalizeUnit(match.groups.unit ?? null),
  };
}

function parseSimpleFoodNameItem(input: string): TLogMealItem | null {
  const trimmed = cleanFoodText(input);
  if (!trimmed || !looksSimpleFood(trimmed)) {
    return null;
  }

  return {
    food: trimmed.toLowerCase(),
    normalised: trimmed.toLowerCase(),
    original: input,
    quantity: 1,
    unit: null,
  };
}

function parseQuantity(value: string): number | null {
  const normalized = value.toLowerCase();
  if (normalized === "a" || normalized === "an" || normalized === "one") {
    return 1;
  }

  const quantity = Number.parseFloat(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

function cleanFoodText(value: string): string {
  return value
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksSimpleFood(value: string): boolean {
  const normalized = value.toLowerCase();
  if (!normalized) return false;
  if (/[,+/&]/.test(normalized)) return false;
  if (/\b(and|with|plus|in|on)\b/.test(normalized)) return false;
  if (looksPreparedMealText(normalized)) return false;

  const tokens = normalized
    .split(" ")
    .filter((token) => token && !["a", "an", "of", "the"].includes(token));

  return tokens.length > 0 && tokens.length <= 4;
}

function matchesMeasuredFoodPattern(value: string): boolean {
  return measuredFoodPattern.test(value.trim());
}

function shouldUseOpenAINormalisation(input: string): boolean {
  const normalized = cleanFoodText(input).toLowerCase();
  if (!normalized) return false;

  if (splitMeasuredSegments(normalized).length > 1) {
    const segments = splitMeasuredSegments(normalized);
    if (segments.every((segment) => parseMeasuredFoodItem(segment))) {
      return false;
    }
  }

  return looksPreparedMealText(normalized);
}

function looksPreparedMealText(value: string): boolean {
  const preparedSignals = [
    "breakfast",
    "burger",
    "burrito",
    "casserole",
    "curry",
    "dinner",
    "fry up",
    "lasagne",
    "lunch",
    "meal",
    "noodles",
    "omelette",
    "pasta",
    "pie",
    "plate",
    "recipe",
    "risotto",
    "salad",
    "sandwich",
    "soup",
    "stew",
    "stir fry",
    "taco",
    "toastie",
    "wrap",
  ];

  if (preparedSignals.some((signal) => hasWord(value, signal))) {
    return true;
  }

  return /\b(with|served with|topped with|filled with)\b/.test(value);
}

function normalizeUnit(value: string | null): string | null {
  if (!value) return null;

  const unit = value.toLowerCase();
  const unitMap: Record<string, string> = {
    bottle: "bottle",
    bottles: "bottle",
    bowl: "bowl",
    bowls: "bowl",
    can: "can",
    cans: "can",
    cup: "cup",
    cups: "cup",
    g: "gram",
    gram: "gram",
    grams: "gram",
    kg: "kilogram",
    kilogram: "kilogram",
    kilograms: "kilogram",
    l: "liter",
    lb: "pound",
    lbs: "pound",
    liter: "liter",
    liters: "liter",
    milliliter: "milliliter",
    milliliters: "milliliter",
    ml: "milliliter",
    ounce: "ounce",
    ounces: "ounce",
    oz: "ounce",
    piece: "piece",
    pieces: "piece",
    pound: "pound",
    pounds: "pound",
    slice: "slice",
    slices: "slice",
    tablespoon: "tablespoon",
    tablespoons: "tablespoon",
    tbsp: "tablespoon",
    teaspoon: "teaspoon",
    teaspoons: "teaspoon",
    tsp: "teaspoon",
  };

  return unitMap[unit] ?? unit;
}

function buildCacheKey(input: string): string {
  return input.trim().replace(/\s+/g, " ").toLowerCase();
}

function readCachedNormalisation(
  cacheKey: string,
): TLogMealNormalised | null {
  const cached = normaliseCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    normaliseCache.delete(cacheKey);
    return null;
  }

  return cached.value;
}

function writeCachedNormalisation(
  cacheKey: string,
  value: TLogMealNormalised,
) {
  normaliseCache.set(cacheKey, {
    expiresAt: Date.now() + OPENAI_CACHE_TTL_MS,
    value,
  });

  if (normaliseCache.size <= OPENAI_CACHE_MAX_ENTRIES) {
    return;
  }

  const firstKey = normaliseCache.keys().next().value;
  if (firstKey) {
    normaliseCache.delete(firstKey);
  }
}

function isOpenAICircuitOpen() {
  if (openAIDisabledUntil <= Date.now()) {
    openAIDisabledUntil = 0;
    consecutiveQuotaFailures = 0;
    return false;
  }

  return true;
}

function maybeLogNormalisationMetrics() {
  if (normaliseMetrics.total % OPENAI_METRIC_LOG_INTERVAL !== 0) {
    return;
  }

  console.info("food/search normaliseInput metrics", {
    ...normaliseMetrics,
    cacheSize: normaliseCache.size,
    openAIDisabledUntil:
      openAIDisabledUntil > 0
        ? new Date(openAIDisabledUntil).toISOString()
        : null,
  });
}

function stripMarkdownCodeFence(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

const measuredFoodPattern =
  /^(?<quantity>a|an|one|\d+(?:\.\d+)?)\s*(?<unit>g|gram|grams|kg|kilogram|kilograms|ml|milliliter|milliliters|l|liter|liters|oz|ounce|ounces|lb|lbs|pound|pounds|cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|slice|slices|piece|pieces|can|cans|bottle|bottles|bowl|bowls)?(?:\s+of)?\s+(?<food>.+)$/i;

function hasWord(text: string, word: string) {
  return new RegExp(`\\b${escapeRegex(word)}\\b`, "i").test(text);
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function rewriteForEdamam(items: TLogMealItem[]): TLogMealItem[] {
  const out: TLogMealItem[] = [];

  for (const item of items) {
    const text = item.normalised.toLowerCase().trim();
    const breadRewrite = rewriteBreadForEdamam(item);
    if (breadRewrite) {
      out.push({
        ...item,
        food: breadRewrite,
        normalised: breadRewrite,
      });
      continue;
    }

    const normalised = normaliseForEdamam(item.normalised);
    // 🔹 jerk chicken -> roast chicken thigh with skin
    if (text === "jerk chicken") {
      out.push({
        ...item,
        normalised: "roast chicken thigh with skin",
      });
      continue;
    }

    // 🔹 plantain rice -> split into rice + plantain
    if (text === "rice and peas") {
      out.push(
        {
          ...item,
          food: "white rice",
          normalised: "boiled white rice",
          quantity: 1,
          unit: "cup",
        },
        {
          ...item,
          food: "kidney beans",
          normalised: "boiled kidney beans",
          quantity: 0.5,
          unit: "cup",
        },
      );
      continue;
    }

    if (text === "rice" || text === "cooked rice") {
      out.push({
        ...item,
        food: "white rice",
        normalised: "boiled white rice",
      });
      continue;
    }

    // 🔹 peas -> green peas
    if (text === "peas") {
      out.push({
        ...item,
        normalised: "green peas",
      });
      continue;
    }

    // 🔹 roast potatoes -> roast white potatoes
    if (text === "roast potatoes") {
      out.push({
        ...item,
        normalised: "roast white potatoes",
      });
      continue;
    }

    // default: keep as is
    out.push({ ...item, normalised });
  }

  return out;
}

function normaliseForEdamam(text: string): string {
  const lower = text
    .toLowerCase()
    .replace(/\btinned\b/g, "canned")
    .replace(/\btin\b/g, "can");

  const mentionsSeeds = /\b(seed|seeds|pepita|pepitas)\b/i.test(lower);

  // Add more ingredients here as you discover issues
  const fleshFirstList = ["pumpkin", "butternut squash"];

  if (!mentionsSeeds) {
    for (const item of fleshFirstList) {
      const re = new RegExp(`\\b${item}\\b`, "i");
      if (re.test(lower) && /\broasted\b/i.test(lower)) {
        // strip roasted / baked / toasted etc. for Edamam
        return lower
          .replace(/\broasted\b/gi, "")
          .replace(/\btoasted\b/gi, "")
          .replace(/\bbaked\b/gi, "")
          .replace(/\s+/g, " ")
          .trim();
      }
    }
  }

  return lower.replace(/\s+/g, " ").trim();
}

function rewriteBreadForEdamam(item: TLogMealItem) {
  const source = [item.original, item.normalised, item.food]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const mentionsBread =
    /\bbread\b/.test(source) || item.normalised.toLowerCase() === "bread";
  if (!mentionsBread) return null;

  if (/\bbrown bread\b/.test(source)) {
    return "whole wheat bread";
  }

  if (
    /\b(wholemeal|whole meal|wholegrain|whole grain|wholewheat|whole wheat|granary)\b/.test(
      source,
    )
  ) {
    return "whole wheat bread";
  }

  return null;
}
