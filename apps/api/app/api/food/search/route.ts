export const runtime = "nodejs";
import { requireUser, SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  TEdamamFoodMeasure,
  ROLES,
} from "@ckd/core";
import type { TFoodSearchCandidate } from "@/packages/core/src/isomorphic/schemas/food_search";
import type {
  TLogMealItem,
  TLogMealNormalised,
  TLogMealResponseItem,
} from "@/packages/core/src/isomorphic/schemas/log_meal";
import { searchOpenFoodFacts } from "@/apps/api/lib/nutrition/searchOpenFoodFacts";
import { NextRequest } from "next/server";
import { applyPhraseRules } from "./applyPhraseRules";
import { normaliseInput, rewriteForEdamam } from "./normaliseInput";

const foodAppKey = process.env.EDAMAM_API_KEY || "";
const foodURI = process.env.EDAMAM_API_FOOD_URI || "";
const foodAppID = process.env.EDAMAM_API_ID || "";
const SEARCH_CATEGORIES = ["packaged-foods", "generic-foods"] as const;

export async function GET(req: NextRequest) {
  const requestId = makeRandomId();
  if (!foodAppID || !foodAppKey || !foodURI) {
    return bad("App vars not found", { requestId }, 403);
  }

  try {
    const user: SessionUser = await requireUser(req);

    if (user.role !== ROLES.Patient) {
      return bad("Patient context missing", { requestId }, 403);
    }

    const { searchParams } = new URL(req.url);
    const term = searchParams.get("query") ?? "";

    const normalised = (await normaliseInput(term)) as TLogMealNormalised;
    if (!normalised || !normalised.items?.length) {
      return bad("Normalisation failed", { requestId }, 400);
    }

    const searchItems = rewriteForEdamam(normalised.items);
    const results = await Promise.all(searchItems.map(resolveMatchesForItem));

    return ok({ items: results, requestId });
    // return NextResponse.json({ items: results, requestId });
  } catch (error: any) {
    const status = error?.status || 500;
    return bad(error.message || "Server error", { requestId }, status);
  }
}

async function pickBestEdamamFood(
  hints: TEdamamFoodMeasure[],
  item: string,
): Promise<TFoodSearchCandidate[] | null> {
  item = item.toLowerCase().trim();
  if (!hints.length) return null;

  const phraseMatch = applyPhraseRules(item, hints as TEdamamFoodMeasure[]);
  const scored = [...hints]
    .map((hint) => ({
      hint,
      score: scoreHint(hint, item, phraseMatch),
    }))
    .sort((a, b) => b.score - a.score);

  return balanceEdamamCandidates(
    scored.map(({ hint }) => ({
      food: {
        ...hint.food,
        nutrients: {
          caloriesKcal: hint.food.nutrients.ENERC_KCAL,
          carbsG: hint.food.nutrients.CHOCDF,
          fatG: hint.food.nutrients.FAT,
          fiberG: hint.food.nutrients.FIBTG,
          proteinG: hint.food.nutrients.PROCNT,
        },
      },
      measures: hint.measures,
      provider: "edamam",
    })),
    item,
  );
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

      const res = await fetch(`${foodURI}?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Edamam error (${res.status})`);
      }

      const data = await res.json();
      return (data?.hints ?? []) as TEdamamFoodMeasure[];
    }),
  );

  return dedupeHints(responses.flat());
}

function dedupeHints(hints: TEdamamFoodMeasure[]): TEdamamFoodMeasure[] {
  const byKey = new Map<string, TEdamamFoodMeasure>();

  for (const hint of hints) {
    const dedupeKey = buildEdamamDedupeKey(hint);
    const existing = byKey.get(dedupeKey);
    if (!existing) {
      byKey.set(dedupeKey, hint);
      continue;
    }

    const existingScore = getCategoryPriority(existing.food.category, "");
    const nextScore = getCategoryPriority(hint.food.category, "");

    if (nextScore > existingScore) {
      byKey.set(dedupeKey, hint);
    }
  }

  return [...byKey.values()];
}

function scoreHint(
  hint: TEdamamFoodMeasure,
  query: string,
  phraseMatch: { food?: { foodId?: string; label?: string } } | null,
) {
  const label = hint.food.label.trim().toLowerCase();
  const brand = hint.food.brand?.trim().toLowerCase() ?? "";
  const knownAs = hint.food.knownAs?.trim().toLowerCase() ?? "";
  const category = hint.food.category ?? "";
  const normalizedQuery = normalizeSearchText(query);
  const normalizedLabel = normalizeSearchText(label);
  const normalizedBrand = normalizeSearchText(brand);
  const normalizedKnownAs = normalizeSearchText(knownAs);
  const combinedSearchText = [normalizedLabel, normalizedBrand, normalizedKnownAs]
    .filter(Boolean)
    .join(" ");
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  let score = 0;

  const phraseFoodId = phraseMatch?.food?.foodId;
  const phraseLabel = phraseMatch?.food?.label?.trim().toLowerCase();

  if (
    phraseMatch &&
    ((phraseFoodId && hint.food.foodId === phraseFoodId) ||
      (phraseLabel && label === phraseLabel))
  ) {
    score += 40;
  }

  if (normalizedLabel === normalizedQuery) score += 120;
  else if (normalizedQuery && normalizedLabel.includes(normalizedQuery))
    score += 70;

  score += getCategoryPriority(category, query);

  if (brand) score += 12;
  if (normalizedBrand && normalizedQuery.includes(normalizedBrand)) score += 55;
  if (!normalizedBrand && !looksBrandedQuery(normalizedQuery)) score += 6;
  if (normalizedKnownAs && normalizedKnownAs === normalizedQuery) score += 35;

  let matchedTokenCount = 0;
  for (const token of queryTokens) {
    if (combinedSearchText.includes(token)) score += 8;
    if (hasWord(combinedSearchText, token)) matchedTokenCount += 1;
    if (normalizedBrand && hasWord(normalizedBrand, token)) score += 16;
  }

  if (queryTokens.length > 1) {
    if (matchedTokenCount === queryTokens.length) score += 30;
    else if (matchedTokenCount <= 1) score -= 25;
  }

  if (query.includes("whole")) {
    const isWholegrainStyle =
      /\b(whole|wholegrain|whole grain|wholemeal|whole meal|wholewheat|whole wheat|granary)\b/.test(
        label,
      );
    if (isWholegrainStyle) score += 45;
    else score -= 20;
  }

  if (/\bbread\b/.test(normalizedQuery)) {
    if (hasWord(label, "bread")) score += 40;
    else score -= 45;

    if (normalizedLabel.includes("brown bread")) score += 70;
    if (
      /\b(wholemeal|whole meal|wholewheat|whole wheat|wholegrain|whole grain|granary)\s+bread\b/.test(
        normalizedLabel,
      )
    ) {
      score += 80;
    }

    const breadSideProductTerms = [
      "crust",
      "crumb",
      "crumbs",
      "crouton",
      "croutons",
      "stuffing",
      "dressing",
      "breading",
    ];
    for (const term of breadSideProductTerms) {
      if (hasWord(label, term)) score -= 80;
    }
  }

  if (normalizedQuery === "brown bread") {
    if (/\bcanned\b/.test(label)) score -= 90;
    if (/\bboston\b/.test(label)) score -= 90;
  }

  const junkTerms = [
    "nugget",
    "nuggets",
    "breaded",
    "school lunch",
    "patty",
    "tender",
    "tenders",
  ];
  for (const term of junkTerms) {
    if (label.includes(term)) score -= 35;
  }

  if (query.includes("chicken")) {
    if (label.includes("chicken")) score += 30;
    else score -= 90;
  }

  if (/\bburger\b/.test(normalizedQuery)) {
    if (/\bburger\b|\bburgers\b|\bpatty\b|\bpatties\b/.test(normalizedLabel)) {
      score += 110;
    } else {
      score -= 120;
    }

    const burgerNoiseTerms = [
      "frankfurter",
      "fat",
      "marrow",
      "meatless",
      "meat",
      "skin",
      "giblet",
      "broth",
      "stock",
    ];
    for (const term of burgerNoiseTerms) {
      if (hasWord(normalizedLabel, term)) score -= 120;
    }
  }

  if (/\bmeatless\b|\bvegan\b|\bvegetarian\b/.test(normalizedLabel)) {
    if (!/\bmeatless\b|\bvegan\b|\bvegetarian\b/.test(normalizedQuery)) {
      score -= 80;
    }
  }

  const mixedDishTerms = [
    "casserole",
    "curry",
    "lasagne",
    "stew",
    "pie",
    "pasta bake",
  ];
  for (const term of mixedDishTerms) {
    if (!hasWord(normalizedQuery, term)) continue;
    if (hasWord(normalizedLabel, term)) {
      score += 130;
    } else {
      score -= 150;
    }
  }

  if (normalizedQuery.split(" ").length > 1) {
    const essentialTokens = normalizedQuery
      .split(" ")
      .filter((token) => !["with", "and", "the", "a", "an", "of"].includes(token));
    const missingEssentialTokens = essentialTokens.filter(
      (token) => !hasWord(combinedSearchText, token),
    );

    if (missingEssentialTokens.length === 0) {
      score += 45;
    } else {
      score -= missingEssentialTokens.length * 70;
    }
  }

  const cookingTerms = [
    "boiled",
    "fried",
    "grilled",
    "roasted",
    "baked",
    "steamed",
    "broiled",
    "poached",
  ];

  for (const term of cookingTerms) {
    const queryHasTerm = query.includes(term);
    const labelHasTerm = label.includes(term);

    if (queryHasTerm && labelHasTerm) score += 20;
    if (!queryHasTerm && labelHasTerm) score -= 12;
  }

  if (query.includes("with skin")) {
    if (label.includes("with skin") || label.includes("skin-on")) score += 20;
    else score -= 10;
  }

  if (query.includes("skinless")) {
    if (label.includes("skinless")) score += 20;
    else score -= 10;
  }

  if (!looksBrandedQuery(normalizedQuery) && hint.food.category === "packaged-foods") {
    score += 8;
  }

  return score;
}

function buildEdamamDedupeKey(hint: TEdamamFoodMeasure) {
  const brand = normalizeSearchText(hint.food.brand ?? "");
  const label = normalizeSearchText(hint.food.label)
    .replace(/\bburgers\b/g, "burger")
    .replace(/\bpatties\b/g, "patty")
    .replace(/\bchicken burgers\b/g, "chicken burger")
    .replace(/\bchicken patties\b/g, "chicken burger")
    .trim();
  return `${brand}::${label}`;
}

function getCategoryPriority(category: string, query: string) {
  if (category === "packaged-foods") {
    return looksBrandedQuery(query) ? 42 : 24;
  }
  if (category === "generic-foods") return looksBrandedQuery(query) ? 8 : 18;
  return 0;
}

function balanceEdamamCandidates(
  candidates: TFoodSearchCandidate[],
  query: string,
): TFoodSearchCandidate[] {
  const branded = candidates.filter(isBrandedCandidate);
  const generic = candidates.filter((candidate) => !isBrandedCandidate(candidate));

  if (looksBrandedQuery(query)) {
    return [...branded, ...generic].slice(0, 8);
  }

  const mixed: TFoodSearchCandidate[] = [];
  mixed.push(...generic.slice(0, 5));
  mixed.push(...branded.slice(0, 3));

  for (const candidate of candidates) {
    if (mixed.length >= 8) break;
    if (
      mixed.some(
        (existing) =>
          existing.provider === candidate.provider &&
          existing.food.foodId === candidate.food.foodId,
      )
    ) {
      continue;
    }
    mixed.push(candidate);
  }

  return mixed;
}

function isBrandedCandidate(candidate: TFoodSearchCandidate) {
  return Boolean(candidate.food.brand?.trim()) || candidate.food.category === "packaged-foods";
}

function looksBrandedQuery(query: string) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return false;

  const brandMarkers = [
    "tesco",
    "asda",
    "sainsburys",
    "sainsbury",
    "waitrose",
    "morrisons",
    "aldi",
    "lidl",
    "heinz",
    "birds eye",
    "coca cola",
    "pepsi",
    "walkers",
    "warburtons",
    "ben and jerrys",
    "muller",
    "yeo valley",
  ];

  return brandMarkers.some((brand) => normalized.includes(brand));
}

function scoreOffCandidate(candidate: TFoodSearchCandidate, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  const label = normalizeSearchText(candidate.food.label);
  const brand = normalizeSearchText(candidate.food.brand ?? "");
  const combined = [brand, label].filter(Boolean).join(" ");
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  let score = 0;

  if (brand && normalizedQuery.includes(brand)) score += 90;
  if (label === normalizedQuery) score += 110;
  else if (label.includes(normalizedQuery)) score += 50;
  if (candidate.metadata?.ukMarketMatch) score += 24;

  for (const token of tokens) {
    if (hasWord(combined, token)) score += 14;
  }

  if (tokens.length > 1 && tokens.every((token) => hasWord(combined, token))) {
    score += 30;
  }

  return score;
}

async function resolveMatchesForItem(item: TLogMealItem) {
  const tempId = makeRandomId();
  const query = item.normalised.trim();
  const brandedQuery = looksBrandedQuery(query);

  let matches: TFoodSearchCandidate[] | null = null;

  if (brandedQuery) {
    const offResults = await searchOpenFoodFacts(query);
    const rankedOff = offResults
      .map((candidate) => ({
        candidate,
        score: scoreOffCandidate(candidate, query),
      }))
      .sort((a, b) => b.score - a.score)
      .map(({ candidate }) => candidate);

    if (rankedOff.length) {
      matches = rankedOff.slice(0, 8);
    } else {
      const hints = await fetchEdamamHints(query);
      matches = await pickBestEdamamFood(hints, query);
    }
  } else {
    const hints = await fetchEdamamHints(query);
    matches = await pickBestEdamamFood(hints, query);
  }

  return {
    item,
    matches,
    tempId,
  } satisfies TLogMealResponseItem;
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
