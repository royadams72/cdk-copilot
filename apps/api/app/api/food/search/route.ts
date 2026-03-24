export const runtime = "nodejs";
import { requireUser, SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  ROLES,
  TEdamamFoodMeasure,
  TLogMealItem,
  TLogMealNormalised,
  TLogMealResponseItem,
} from "@ckd/core";
import { NextRequest } from "next/server";
import { applyPhraseRules } from "./applyPhraseRules";
import { normaliseInput, rewriteForEdamam } from "./normaliseInput";

const foodAppKey = process.env.EDAMAM_API_KEY || "";
const foodURI = process.env.EDAMAM_API_FOOD_URI || "";
const foodAppID = process.env.EDAMAM_API_ID || "";

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

    const itemsForEdamam = rewriteForEdamam(normalised.items);

    const results = await Promise.all(
      itemsForEdamam.map(async (item: TLogMealItem) => {
        const tempId = makeRandomId();
        const edamamText = item.normalised;

        const params = new URLSearchParams({
          app_id: foodAppID,
          app_key: foodAppKey,
          category: "generic-foods",
          ingr: edamamText,
          "nutrition-type": "logging",
        });

        const res = await fetch(`${foodURI}?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Edamam error (${res.status})`);
        }

        const data = await res.json();
        const matches: TEdamamFoodMeasure[] | null = await pickBestEdamamFood(
          data,
          edamamText,
        );

        return {
          tempId,
          item, // original normalised item
          matches, // Edamam parser response for this item
        } satisfies TLogMealResponseItem;
      }),
    );

    return ok({ items: results, requestId });
    // return NextResponse.json({ items: results, requestId });
  } catch (error: any) {
    const status = error?.status || 500;
    return bad(error.message || "Server error", { requestId }, status);
  }
}

export async function pickBestEdamamFood(
  data: any,
  item: string,
): Promise<TEdamamFoodMeasure[] | null> {
  item = item.toLowerCase();
  const hints = (data?.hints ?? []) as any[];

  if (!hints.length) return null;

  // Prefer generic foods
  const genericFoods = hints.filter((h) => h.food.categoryLabel === "food");
  const pool = genericFoods.length ? genericFoods : hints;

  const phraseMatch = applyPhraseRules(item, pool as TEdamamFoodMeasure[]);

  return [...pool]
    .sort(
      (a, b) =>
        scoreHint(b as TEdamamFoodMeasure, item, phraseMatch) -
        scoreHint(a as TEdamamFoodMeasure, item, phraseMatch),
    )
    .map((entry) => entry as TEdamamFoodMeasure);
}

function scoreHint(
  hint: TEdamamFoodMeasure,
  query: string,
  phraseMatch: { food?: { foodId?: string; label?: string } } | null,
) {
  const label = hint.food.label.trim().toLowerCase();
  const normalizedQuery = normalizeSearchText(query);
  const normalizedLabel = normalizeSearchText(label);
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

  let matchedTokenCount = 0;
  for (const token of queryTokens) {
    if (label.includes(token)) score += 8;
    if (hasWord(label, token)) matchedTokenCount += 1;
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
    if (label.includes("chicken")) score += 15;
    else score -= 20;
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

  return score;
}

function normalizeSearchText(text: string) {
  return text.toLowerCase().replace(/[^\w\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function hasWord(text: string, word: string) {
  return new RegExp(`\\b${escapeRegex(word)}\\b`, "i").test(text);
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
