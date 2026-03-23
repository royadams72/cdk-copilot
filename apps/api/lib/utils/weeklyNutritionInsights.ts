import OpenAI from "openai";
import {
  TFoodTaxonomyDocument,
  TPatientGoalCode,
  TWeeklyNutritionGoal,
  TWeeklyNutritionInsight,
  WeeklyNutritionInsight,
} from "@ckd/core";
import { COLLECTIONS, getCollection } from "@ckd/core/server";
import type { Db, ObjectId } from "mongodb";

import type { NutritionEntryDoc } from "../types/dashboard";
import { fetchNutritionEntriesInRange } from "./dashboard";
import { attachFoodTaxonomies } from "./foodTaxonomy";
import { getPatientGoalsCurrent, resolveActivePatientGoals } from "./patientGoals";
import { getMappedNutritionTargets } from "./targets";

type NutrientReason = "phosphorus" | "potassium" | "sodium" | "protein" | "calories";
type NutrientMetricKey = "phosphorusMg" | "potassiumMg" | "sodiumMg" | "proteinG" | "caloriesKcal";

type FoodContribution = {
  alternatives: string[];
  availableSwapGroups: string[];
  contribution: number;
  food: string;
  nutrientAmount: number;
  nutrientReason: NutrientReason;
  primarySwapGroup: string | null;
  secondarySwapGroups: string[];
};

type FoodSwapRuleDoc = {
  candidateSwapGroups?: string[];
  isActive?: boolean;
  nutrientFocus?: NutrientReason;
  notes?: string | null;
  swapGroup?: string;
  updatedAt?: Date;
};

const OPENAI_SUMMARY_MODEL = "gpt-4.1-mini";
const CONTRIBUTOR_LIMIT = 3;

const DEFAULT_SWAP_GROUP_FOODS: Record<string, string[]> = {
  cream_cheese_spread: ["cream cheese"],
  egg: ["egg"],
  fresh_fish: ["cod", "haddock"],
  fresh_poultry: ["chicken breast", "turkey"],
  fruit: ["apple", "berries"],
  low_phosphate_soft_drink: ["lemonade", "clear soda"],
  low_phosphorus_spread: ["jam", "honey"],
  lower_calorie_dessert: ["yoghurt", "fruit salad"],
  lower_phosphorus_yoghurt: ["greek-style yoghurt", "plain yoghurt"],
  plain_pasta: ["plain pasta", "pasta with tomato sauce"],
  popcorn: ["plain popcorn"],
  plain_crackers: ["plain crackers", "rice cakes"],
  soft_cheese: ["ricotta", "cottage cheese"],
  unsalted_snack: ["unsalted popcorn", "rice cakes"],
  water: ["water"],
  water_flavoured: ["sparkling water", "flavoured water"],
};

const SWAP_GROUP_NUTRIENT_RELEVANCE: Partial<
  Record<NutrientReason, Partial<Record<string, number>>>
> = {
  calories: {
    cola_soft_drink: 3,
    crisps: 3,
    dessert: 3,
    hard_cheese: 2,
    nut_butter: 2,
    nuts_and_seeds: 2,
    pasta: 2,
    red_meat: 2,
    soft_drink: 3,
  },
  phosphorus: {
    bacon: 2,
    cola_soft_drink: 3,
    fresh_fish: 2,
    hard_cheese: 3,
    nut_butter: 3,
    nuts_and_seeds: 3,
    processed_meat: 2,
    red_meat: 2,
    sausage: 2,
    shellfish: 2,
    soft_cheese: 2,
  },
  potassium: {
    fruit: 2,
    nut_butter: 2,
    nuts_and_seeds: 2,
    vegetable: 2,
  },
  protein: {
    egg: 3,
    fresh_fish: 3,
    fresh_poultry: 3,
    hard_cheese: 1,
    nuts_and_seeds: 1,
    processed_meat: 2,
    red_meat: 3,
    shellfish: 3,
    soft_cheese: 1,
  },
  sodium: {
    bacon: 3,
    cola_soft_drink: 1,
    crisps: 3,
    hard_cheese: 3,
    mixed_meal: 1,
    processed_meat: 3,
    sausage: 3,
    soft_drink: 2,
    soft_cheese: 2,
  },
};

function toWeeklyNutritionInsight(value: Record<string, unknown>) {
  const { _id: _ignored, ...doc } = value;
  return WeeklyNutritionInsight.parse(doc);
}

function startOfDayUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDaysUtc(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function round(value: number, precision = 0) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function severityFromDelta(actual: number, target: number) {
  if (target <= 0) return "low" as const;
  const ratio = Math.abs(actual - target) / target;
  if (ratio >= 0.25) return "high" as const;
  if (ratio >= 0.1) return "moderate" as const;
  return "low" as const;
}

function humanizeReason(reason: NutrientReason) {
  if (reason === "calories") return "calorie";
  return reason;
}

function resolveCompletedWeekWindow(referenceDate = new Date()) {
  const currentWeekStart = startOfDayUtc(referenceDate);
  const dayOfWeek = currentWeekStart.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const mondayThisWeek = addDaysUtc(currentWeekStart, -daysSinceMonday);
  const weekStart = addDaysUtc(mondayThisWeek, -7);
  const weekEnd = addDaysUtc(weekStart, 6);
  const weekEndExclusive = addDaysUtc(weekEnd, 1);

  return { weekEnd, weekEndExclusive, weekStart };
}

async function resolvePatientGoal(
  db: Db,
  patientId: ObjectId,
): Promise<TWeeklyNutritionGoal> {
  const current = await getPatientGoalsCurrent(db, patientId);
  const activeGoals = resolveActivePatientGoals(current);
  const primaryGoal = activeGoals[0]?.effectiveCode as TPatientGoalCode | undefined;
  return primaryGoal ?? "general_health";
}

function sumMetric(entries: NutritionEntryDoc[], metricKey: NutrientMetricKey) {
  return entries.reduce((sum, entry) => {
    const value = entry.totals?.[metricKey];
    return sum + (typeof value === "number" && Number.isFinite(value) ? value : 0);
  }, 0);
}

function averageDailyMetric(entries: NutritionEntryDoc[], metricKey: NutrientMetricKey) {
  return sumMetric(entries, metricKey) / 7;
}

async function ensureTaxonomyOnEntries(db: Db, entries: NutritionEntryDoc[]) {
  const collection = db.collection<NutritionEntryDoc>(COLLECTIONS.NutritionLedger);

  for (const entry of entries) {
    const items = entry.items ?? [];
    const missing = items.some((item) => !item.taxonomy);
    if (!missing) continue;
    const nextItems = await attachFoodTaxonomies(db, items);
    await collection.updateOne({ _id: entry._id }, { $set: { items: nextItems, updatedAt: new Date() } });
    entry.items = nextItems;
  }
}

function contributionKey(item: NutritionEntryDoc["items"][number]) {
  return item.taxonomy?.taxonomyKey ?? `${item.foodId}:${item.uid}:${item.name}`;
}

function getNutrientValue(
  item: NutritionEntryDoc["items"][number],
  nutrientKey: NutrientMetricKey,
) {
  const value = item.nutrients?.[nutrientKey];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getItemSwapGroups(item: NutritionEntryDoc["items"][number]) {
  const primarySwapGroup =
    item.taxonomy?.primarySwapGroup ?? item.taxonomy?.swapGroup ?? null;
  const secondarySwapGroups = Array.isArray(item.taxonomy?.secondarySwapGroups)
    ? item.taxonomy.secondarySwapGroups.filter(
        (group): group is string => Boolean(group && group !== primarySwapGroup),
      )
    : [];
  return {
    availableSwapGroups: [
      ...new Set(
        [primarySwapGroup, ...secondarySwapGroups].filter(
          (group): group is string => Boolean(group),
        ),
      ),
    ],
    primarySwapGroup,
    secondarySwapGroups,
  };
}

function rankContributorSwapGroups(contributor: FoodContribution) {
  return [...contributor.availableSwapGroups].sort((left, right) => {
    const leftScore =
      (left === contributor.primarySwapGroup ? 1 : 0) +
      (SWAP_GROUP_NUTRIENT_RELEVANCE[contributor.nutrientReason]?.[left] ?? 0);
    const rightScore =
      (right === contributor.primarySwapGroup ? 1 : 0) +
      (SWAP_GROUP_NUTRIENT_RELEVANCE[contributor.nutrientReason]?.[right] ?? 0);

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }
    return contributor.availableSwapGroups.indexOf(left) -
      contributor.availableSwapGroups.indexOf(right);
  });
}

function collectTopContributors(
  entries: NutritionEntryDoc[],
  nutrientKey: NutrientMetricKey,
  nutrientReason: NutrientReason,
): FoodContribution[] {
  const total = entries.reduce((sum, entry) => {
    return (
      sum +
      (entry.items ?? []).reduce(
        (itemSum, item) => itemSum + getNutrientValue(item, nutrientKey),
        0,
      )
    );
  }, 0);

  if (total <= 0) {
    return [];
  }

  const buckets = new Map<
    string,
    {
      availableSwapGroups: string[];
      canonicalName: string;
      nutrientAmount: number;
      primarySwapGroup: string | null;
      secondarySwapGroups: string[];
    }
  >();

  for (const entry of entries) {
    for (const item of entry.items ?? []) {
      const amount = getNutrientValue(item, nutrientKey);
      if (amount <= 0) continue;
      const key = contributionKey(item);
      const swapGroups = getItemSwapGroups(item);
      const bucket = buckets.get(key) ?? {
        availableSwapGroups: swapGroups.availableSwapGroups,
        canonicalName: item.taxonomy?.canonicalName ?? item.name ?? "Logged food",
        nutrientAmount: 0,
        primarySwapGroup: swapGroups.primarySwapGroup,
        secondarySwapGroups: swapGroups.secondarySwapGroups,
      };
      bucket.nutrientAmount += amount;
      bucket.availableSwapGroups = [
        ...new Set([
          ...bucket.availableSwapGroups,
          ...swapGroups.availableSwapGroups,
        ]),
      ];
      bucket.secondarySwapGroups = [
        ...new Set([
          ...bucket.secondarySwapGroups,
          ...swapGroups.secondarySwapGroups,
        ]),
      ];
      buckets.set(key, bucket);
    }
  }

  return Array.from(buckets.values())
    .sort((a, b) => b.nutrientAmount - a.nutrientAmount)
    .slice(0, CONTRIBUTOR_LIMIT)
    .map((bucket) => ({
      alternatives: [],
      availableSwapGroups: bucket.availableSwapGroups,
      contribution: round((bucket.nutrientAmount / total) * 100),
      food: bucket.canonicalName,
      nutrientAmount: round(bucket.nutrientAmount),
      nutrientReason,
      primarySwapGroup: bucket.primarySwapGroup,
      secondarySwapGroups: bucket.secondarySwapGroups,
    }));
}

async function resolveAlternatives(
  db: Db,
  contributor: FoodContribution,
): Promise<string[]> {
  if (contributor.availableSwapGroups.length === 0) {
    return [];
  }

  const swapRules = getCollection<FoodSwapRuleDoc>(db, COLLECTIONS.FoodSwapRules);
  const taxonomyCollection = getCollection<TFoodTaxonomyDocument>(
    db,
    COLLECTIONS.FoodTaxonomy,
  );
  let candidateGroups: string[] = [];

  for (const swapGroup of rankContributorSwapGroups(contributor)) {
    const rule = await swapRules.findOne(
      {
        isActive: true,
        nutrientFocus: contributor.nutrientReason,
        swapGroup,
      },
      { sort: { updatedAt: -1 } },
    );
    candidateGroups = rule?.candidateSwapGroups ?? [];
    if (candidateGroups.length > 0) {
      break;
    }
  }

  if (candidateGroups.length === 0) {
    return [];
  }

  const alternatives = new Set<string>();
  const taxonomyMatches = await taxonomyCollection
    .find(
      { swapGroup: { $in: candidateGroups } },
      { projection: { canonicalName: 1, swapGroup: 1 }, sort: { updatedAt: -1 } },
    )
    .limit(12)
    .toArray();

  for (const doc of taxonomyMatches) {
    if (doc.canonicalName) {
      alternatives.add(doc.canonicalName);
    }
  }

  for (const group of candidateGroups) {
    for (const food of DEFAULT_SWAP_GROUP_FOODS[group] ?? []) {
      alternatives.add(food);
    }
  }

  return Array.from(alternatives).slice(0, 3);
}

function buildFallbackHumanMessage(summary: {
  findings: TWeeklyNutritionInsight["findings"];
  goal: TWeeklyNutritionGoal;
  suggestions: TWeeklyNutritionInsight["suggestions"];
}) {
  const parts: string[] = [];

  for (const finding of summary.findings) {
    const nutrient = finding.type.replace(/^high_/, "").replace(/^low_/, "");
    const comparator = finding.type.startsWith("low_") ? "below" : "above";
    const foods =
      finding.topFoods.length > 0 ? `, mainly from ${finding.topFoods.join(" and ")}` : "";
    parts.push(`Your ${nutrient.replace(/_/g, " ")} was ${comparator} target this week${foods}.`);
  }

  for (const suggestion of summary.suggestions) {
    parts.push(
      `A simple change would be to replace ${suggestion.fromFood} with ${suggestion.alternatives.join(
        " or ",
      )}.`,
    );
  }

  if (summary.goal === "weight_loss") {
    parts.push("For weight loss, aim for lower-calorie swaps without changing the role that food plays in your meals.");
  }

  return parts.join(" ").trim() || "Your weekly nutrition summary is ready.";
}

async function buildHumanMessage(summary: {
  findings: TWeeklyNutritionInsight["findings"];
  goal: TWeeklyNutritionGoal;
  suggestions: TWeeklyNutritionInsight["suggestions"];
}) {
  if (!process.env.OPENAI_API_KEY) {
    return buildFallbackHumanMessage(summary);
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = [
      "Write a short, human-friendly weekly nutrition summary.",
      "Do not invent findings or suggestions.",
      "Use the provided goal only as tone/context.",
      "Keep it to 2-4 sentences.",
      "Mention the top food contributors and suggested swaps plainly.",
      JSON.stringify(summary),
    ].join("\n");

    const response = await openai.responses.create({
      input: prompt,
      model: OPENAI_SUMMARY_MODEL,
    });

    const text = response.output_text?.trim();
    return text || buildFallbackHumanMessage(summary);
  } catch {
    return buildFallbackHumanMessage(summary);
  }
}

export async function generateWeeklyNutritionInsight(
  db: Db,
  patientId: ObjectId,
  options?: {
    referenceDate?: Date;
  },
): Promise<TWeeklyNutritionInsight> {
  const { weekStart, weekEnd, weekEndExclusive } = resolveCompletedWeekWindow(
    options?.referenceDate ?? new Date(),
  );
  const [entries, nutritionTargets, goal] = await Promise.all([
    fetchNutritionEntriesInRange(db, patientId, weekStart, weekEndExclusive),
    getMappedNutritionTargets(db, patientId),
    resolvePatientGoal(db, patientId),
  ]);

  await ensureTaxonomyOnEntries(db, entries);

  const findings: TWeeklyNutritionInsight["findings"] = [];
  const suggestions: TWeeklyNutritionInsight["suggestions"] = [];

  const phosphorusTarget = nutritionTargets.phosphorusMg;
  const sodiumTarget = nutritionTargets.sodiumMg;
  const potassiumTarget = nutritionTargets.potassiumMg;
  const proteinTarget = nutritionTargets.proteinG;
  const caloriesTarget = nutritionTargets.caloriesKcal;

  const nutrientChecks: Array<{
    findingType: string;
    metricKey: NutrientMetricKey;
    nutrientReason: NutrientReason;
    target?: number;
    when: (actual: number, target: number) => boolean;
  }> = [
    {
      findingType: "high_phosphorus",
      metricKey: "phosphorusMg",
      nutrientReason: "phosphorus",
      target: phosphorusTarget,
      when: (actual, target) => actual > target,
    },
    {
      findingType: "high_sodium",
      metricKey: "sodiumMg",
      nutrientReason: "sodium",
      target: sodiumTarget,
      when: (actual, target) => actual > target,
    },
    {
      findingType: "high_potassium",
      metricKey: "potassiumMg",
      nutrientReason: "potassium",
      target: potassiumTarget,
      when: (actual, target) => actual > target,
    },
    {
      findingType: "low_protein",
      metricKey: "proteinG",
      nutrientReason: "protein",
      target: proteinTarget,
      when: (actual, target) => actual < target,
    },
  ];

  if (goal === "weight_loss" && typeof caloriesTarget === "number") {
    nutrientChecks.push({
      findingType: "high_calories",
      metricKey: "caloriesKcal",
      nutrientReason: "calories",
      target: caloriesTarget,
      when: (actual, target) => actual > target,
    });
  }

  for (const check of nutrientChecks) {
    if (typeof check.target !== "number" || check.target <= 0) continue;
    const actual = round(averageDailyMetric(entries, check.metricKey));
    if (!check.when(actual, check.target)) continue;

    const topContributors = collectTopContributors(
      entries,
      check.metricKey,
      check.nutrientReason,
    );
    findings.push({
      type: check.findingType,
      severity: severityFromDelta(actual, check.target),
      actual,
      target: round(check.target),
      topFoods: topContributors.slice(0, 3).map((item) => item.food),
      topContributors: topContributors.slice(0, 3).map((item) => ({
        contribution: item.contribution,
        food: item.food,
        nutrientAmount: item.nutrientAmount,
      })),
    });

    for (const contributor of topContributors.slice(0, 3)) {
      const alternatives = await resolveAlternatives(db, contributor);
      if (alternatives.length === 0) continue;
      suggestions.push({
        fromFood: contributor.food,
        reason: contributor.nutrientReason,
        alternatives,
      });
    }
  }

  const dedupedSuggestions = suggestions.filter((suggestion, index, list) => {
    return (
      list.findIndex(
        (item) =>
          item.fromFood === suggestion.fromFood && item.reason === suggestion.reason,
      ) === index
    );
  });

  const humanMessage = await buildHumanMessage({
    findings,
    goal,
    suggestions: dedupedSuggestions,
  });

  return WeeklyNutritionInsight.parse({
    patientId: patientId.toString(),
    weekStart: toDateOnly(weekStart),
    weekEnd: toDateOnly(weekEnd),
    goal,
    findings,
    suggestions: dedupedSuggestions,
    humanMessage,
    generatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function saveWeeklyNutritionInsight(
  db: Db,
  insight: TWeeklyNutritionInsight,
) {
  const collection = getCollection<TWeeklyNutritionInsight>(
    db,
    COLLECTIONS.WeeklyNutritionInsights,
  );
  const now = new Date();

  await collection.updateOne(
    {
      patientId: insight.patientId,
      weekStart: insight.weekStart,
      weekEnd: insight.weekEnd,
    },
    {
      $set: {
        ...insight,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true },
  );

  return WeeklyNutritionInsight.parse({
    ...insight,
    createdAt: insight.createdAt ?? now,
    updatedAt: now,
  });
}

export async function runWeeklyNutritionInsightForPatient(
  db: Db,
  patientId: ObjectId,
  options?: {
    referenceDate?: Date;
  },
) {
  const insight = await generateWeeklyNutritionInsight(db, patientId, options);
  return saveWeeklyNutritionInsight(db, insight);
}

export async function runWeeklyNutritionInsightsForActivePatients(
  db: Db,
  options?: {
    referenceDate?: Date;
  },
) {
  const { weekStart, weekEndExclusive } = resolveCompletedWeekWindow(
    options?.referenceDate ?? new Date(),
  );
  const patientIds = (await db
    .collection(COLLECTIONS.NutritionLedger)
    .distinct("patientId", {
      eatenAt: { $gte: weekStart, $lt: weekEndExclusive },
    })) as ObjectId[];

  const results: TWeeklyNutritionInsight[] = [];
  for (const patientId of patientIds) {
    if (!patientId) continue;
    results.push(
      await runWeeklyNutritionInsightForPatient(db, patientId, options),
    );
  }
  return results;
}

export async function getLatestWeeklyNutritionInsight(
  db: Db,
  patientId: ObjectId,
) {
  const collection = getCollection<TWeeklyNutritionInsight>(
    db,
    COLLECTIONS.WeeklyNutritionInsights,
  );
  const doc = await collection.findOne(
    { patientId: patientId.toString() },
    { sort: { weekStart: -1, updatedAt: -1 } },
  );
  return doc ? toWeeklyNutritionInsight(doc as Record<string, unknown>) : null;
}

export function formatContributorLines(
  contributors: FoodContribution[],
  nutrientReason: NutrientReason,
) {
  return contributors.map(
    (item) =>
      `${item.food} contributed ${item.contribution}% of your ${humanizeReason(
        nutrientReason,
      )} intake`,
  );
}
