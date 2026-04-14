import { BRAND_MARKERS } from "./brandMarkers";
import { INGREDIENT_QUERY_STOPWORD_SET } from "./ingredientStopwords";

type IngredientCandidate = {
  name: string;
  percent?: number;
  source?: "parsed" | "label";
};

const TOP_LEVEL_COMPONENT_BOOSTS = [
  "chicken",
  "beef",
  "turkey",
  "pork",
  "rice",
  "cooked rice",
  "noodles",
  "cooked noodles",
  "pasta",
  "potato",
  "potatoes",
  "roast potatoes",
  "saute potato",
  "saut potato",
  "mashed potato",
  "peas",
  "carrot",
  "baby carrots",
  "broccoli",
  "broccoli florets",
  "sweetcorn",
  "stuffing",
  "yorkshire pudding",
] as const;

const COMPONENT_EXCLUSION_PHRASES = [
  "rice wine",
  "rice vinegar",
  "potato starch",
  "potato maltodextrin",
  "wheat flour",
  "cornflour",
  "maize flour",
  "maize starch",
  "onion powder",
  "garlic powder",
  "chicken powder",
  "chicken extract",
  "beef extract",
  "turmeric powder",
] as const;

export function buildIngredientCandidates(
  foodContentsLabel: string | undefined,
  query: string,
) {
  const parsedCandidates = extractParsedIngredientCandidates(query);
  const labelCandidates = extractFoodLabelIngredientCandidates(foodContentsLabel);
  const candidates = [...parsedCandidates, ...labelCandidates];
  const merged = new Map<string, IngredientCandidate>();

  for (const candidate of candidates) {
    const key = normalizeIngredientKey(candidate.name);
    if (!key) continue;

    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, candidate);
      continue;
    }

    merged.set(key, {
      ...existing,
      percent:
        typeof existing.percent === "number"
          ? existing.percent
          : candidate.percent,
      source: existing.source === "parsed" ? "parsed" : candidate.source,
    });
  }

  return [...merged.values()]
    .sort((a, b) => scoreIngredientCandidate(b) - scoreIngredientCandidate(a))
    .slice(0, 6);
}

function extractParsedIngredientCandidates(query: string) {
  const normalized = normalizeIngredientLabel(
    query
      .replace(
        /\b\d+(?:\.\d+)?\s?(g|gram|grams|kg|kilogram|kilograms|ml|milliliter|milliliters|l|liter|liters)\b/gi,
        " ",
      )
      .replace(/[()]/g, " "),
  );
  if (!normalized) return [];

  const tokens = normalized.split(" ").filter(Boolean);
  if (!tokens.length) return [];

  const filtered = tokens.filter(
    (token) =>
      !BRAND_MARKERS.some(
        (brand) => normalizeSearchText(brand) === normalizeSearchText(token),
      ) && !INGREDIENT_QUERY_STOPWORD_SET.has(token),
  );

  if (!filtered.length) return [];

  return [
    {
      name: filtered.slice(0, 2).join(" "),
      percent: undefined,
      source: "parsed" as const,
    },
  ];
}

function extractFoodLabelIngredientCandidates(
  foodContentsLabel: string | undefined,
) {
  if (!foodContentsLabel?.trim()) return [];

  const normalizedLabel = normalizePercentSeparators(foodContentsLabel);
  const rawSegments = normalizedLabel
    .split(";")
    .map((segment) => segment.trim())
    .filter(Boolean);

  const results: IngredientCandidate[] = [];

  for (const rawSegment of rawSegments) {
    const segment = stripIngredientsPrefix(rawSegment);
    if (!segment) continue;
    if (isNestedContainsBoundary(segment)) break;

    const percentOnly = parseStandalonePercent(segment);
    if (typeof percentOnly === "number") {
      const previous = results[results.length - 1];
      if (previous && typeof previous.percent !== "number") {
        previous.percent = percentOnly;
      }
      continue;
    }

    const percentMatch = segment.match(/(\d+(?:\.\d+)?)\s*%/);
    const normalizedName = normalizeIngredientLabel(
      segment.replace(/\([^)]*\)/g, " ").replace(/(\d+(?:\.\d+)?)\s*%/g, " "),
    );
    if (!normalizedName) continue;

    results.push({
      name: normalizedName,
      percent: percentMatch ? Number.parseFloat(percentMatch[1]) : undefined,
      source: "label" as const,
    });
  }

  return results;
}

function normalizePercentSeparators(value: string) {
  return value.replace(/(\d)\s*;\s*(\d+\s*%)/g, "$1.$2");
}

function stripIngredientsPrefix(value: string) {
  return value.replace(/^ingredients:\s*/i, "").trim();
}

function parseStandalonePercent(value: string) {
  const match = value.match(/^(\d+(?:\.\d+)?)\s*%$/);
  return match ? Number.parseFloat(match[1]) : undefined;
}

function isNestedContainsBoundary(value: string) {
  return /\bcontains?\b/i.test(value);
}

function normalizeIngredientLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/\bcooked\b/g, " ")
    .replace(/\bprepared\b/g, " ")
    .replace(/\bbreast fillet\b/g, "chicken")
    .replace(/\bbreast strips\b/g, "chicken")
    .replace(/\bbreast strip\b/g, "chicken")
    .replace(/\bbreast\b/g, " ")
    .replace(/\bfillet\b/g, " ")
    .replace(/\bboneless\b/g, " ")
    .replace(/\bskinless\b/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIngredientKey(value: string) {
  return normalizeIngredientLabel(value)
    .replace(/\bcooked rice\b/g, "rice")
    .replace(/\bcooked noodles\b/g, "noodles")
    .replace(/\bcooked chicken breast\b/g, "chicken")
    .replace(/\bchicken breast\b/g, "chicken")
    .replace(/\bbaby carrots\b/g, "carrot")
    .replace(/\broast potatoes\b/g, "potato")
    .trim();
}

function scoreIngredientCandidate(candidate: IngredientCandidate) {
  let score = 0;
  const normalizedName = normalizeIngredientKey(candidate.name);

  if (candidate.source === "parsed") score += 100;
  if (typeof candidate.percent === "number") score += 50 + candidate.percent;

  for (const boosted of TOP_LEVEL_COMPONENT_BOOSTS) {
    if (hasWord(normalizedName, boosted)) {
      score += 35;
    }
  }

  for (const excluded of COMPONENT_EXCLUSION_PHRASES) {
    if (normalizedName.includes(excluded)) {
      score -= 80;
    }
  }

  if (/\bsauce\b/.test(normalizedName)) score -= 15;
  if (/\bgravy\b/.test(normalizedName)) score += 10;

  return score;
}

function normalizeSearchText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasWord(text: string, word: string) {
  return new RegExp(`\\b${escapeRegex(word)}\\b`, "i").test(text);
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
