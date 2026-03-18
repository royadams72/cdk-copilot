import OpenAI from "openai";
import {
  TFoodTaxonomyDocument,
  TWeeklyNutritionGoal,
  TWeeklyNutritionInsight,
  WeeklyNutritionInsight,
} from "@ckd/core";
import { COLLECTIONS, getCollection } from "@ckd/core/server";
import type { Db, ObjectId } from "mongodb";

import type { NutritionEntryDoc } from "../types/dashboard";
import { fetchNutritionEntriesInRange } from "./dashboard";
import { attachFoodTaxonomies } from "./foodTaxonomy";
import { getMappedNutritionTargets } from "./targets";

type NutrientReason = "phosphorus" | "potassium" | "sodium" | "protein" | "calories";
type NutrientMetricKey = "phosphorusMg" | "potassiumMg" | "sodiumMg" | "proteinG" | "caloriesKcal";

type FoodContribution = {
  alternatives: string[];
  contribution: number;
  food: string;
  nutrientAmount: number;
  nutrientReason: NutrientReason;
  swapGroup: string | null;
};

type FoodSwapRuleDoc = {
  candidateSwapGroups?: string[];
  isActive?: boolean;
  nutrientFocus?: NutrientReason;
  notes?: string | null;
  swapGroup?: string;
  updatedAt?: Date;
};

type PatientsDoc = {
  flags?: string[];
  goal?: string | null;
  summary?: {
    goal?: string | null;
    primaryGoal?: string | null;
  } | null;
};

type UsersClinicalGoalDoc = {
  goal?: string | null;
  primaryGoal?: string | null;
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
  lower_calorie_dessert: ["yoghurt", "fruit salad"],
  lower_phosphorus_yoghurt: ["greek-style yoghurt", "plain yoghurt"],
  plain_crackers: ["plain crackers", "rice cakes"],
  soft_cheese: ["ricotta", "cottage cheese"],
  unsalted_snack: ["unsalted popcorn", "rice cakes"],
  water: ["water"],
  water_flavoured: ["sparkling water", "flavoured water"],
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

async function resolvePatientGoal(db: Db, patientId: ObjectId): Promise<TWeeklyNutritionGoal> {
  const [patientDoc, clinicalDoc] = await Promise.all([
    db.collection<PatientsDoc>(COLLECTIONS.Patients).findOne(
      { _id: patientId },
      { projection: { flags: 1, goal: 1, summary: 1 } },
    ),
    db.collection<UsersClinicalGoalDoc>(COLLECTIONS.UsersClinical).findOne(
      { patientId },
      { projection: { goal: 1, primaryGoal: 1 } },
    ),
  ]);

  const values = [
    patientDoc?.goal,
    patientDoc?.summary?.goal,
    patientDoc?.summary?.primaryGoal,
    clinicalDoc?.goal,
    clinicalDoc?.primaryGoal,
    ...(patientDoc?.flags ?? []),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  if (values.some((value) => value.includes("weight_loss") || value.includes("lose weight"))) {
    return "weight_loss";
  }
  if (values.some((value) => value.includes("weight_gain") || value.includes("gain weight"))) {
    return "weight_gain";
  }
  if (
    values.some(
      (value) => value.includes("maintain weight") || value.includes("weight_maintenance"),
    )
  ) {
    return "weight_maintenance";
  }
  if (values.some((value) => value.includes("energy"))) {
    return "better_energy";
  }
  if (values.some((value) => value.includes("renal"))) {
    return "renal_support";
  }
  return "general_health";
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
      canonicalName: string;
      nutrientAmount: number;
      swapGroup: string | null;
    }
  >();

  for (const entry of entries) {
    for (const item of entry.items ?? []) {
      const amount = getNutrientValue(item, nutrientKey);
      if (amount <= 0) continue;
      const key = contributionKey(item);
      const bucket = buckets.get(key) ?? {
        canonicalName: item.taxonomy?.canonicalName ?? item.name ?? "Logged food",
        nutrientAmount: 0,
        swapGroup: item.taxonomy?.swapGroup ?? null,
      };
      bucket.nutrientAmount += amount;
      buckets.set(key, bucket);
    }
  }

  return Array.from(buckets.values())
    .sort((a, b) => b.nutrientAmount - a.nutrientAmount)
    .slice(0, CONTRIBUTOR_LIMIT)
    .map((bucket) => ({
      alternatives: [],
      contribution: round((bucket.nutrientAmount / total) * 100),
      food: bucket.canonicalName,
      nutrientAmount: round(bucket.nutrientAmount),
      nutrientReason,
      swapGroup: bucket.swapGroup,
    }));
}

async function resolveAlternatives(
  db: Db,
  contributor: FoodContribution,
): Promise<string[]> {
  if (!contributor.swapGroup) {
    return [];
  }

  const swapRules = getCollection<FoodSwapRuleDoc>(db, COLLECTIONS.FoodSwapRules);
  const taxonomyCollection = getCollection<TFoodTaxonomyDocument>(
    db,
    COLLECTIONS.FoodTaxonomy,
  );
  const rule = await swapRules.findOne(
    {
      isActive: true,
      nutrientFocus: contributor.nutrientReason,
      swapGroup: contributor.swapGroup,
    },
    { sort: { updatedAt: -1 } },
  );

  const candidateGroups = rule?.candidateSwapGroups ?? [];
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
    goalOverride?: TWeeklyNutritionGoal;
    referenceDate?: Date;
  },
): Promise<TWeeklyNutritionInsight> {
  const { weekStart, weekEnd, weekEndExclusive } = resolveCompletedWeekWindow(
    options?.referenceDate ?? new Date(),
  );
  const [entries, nutritionTargets, goal] = await Promise.all([
    fetchNutritionEntriesInRange(db, patientId, weekStart, weekEndExclusive),
    getMappedNutritionTargets(db, patientId),
    options?.goalOverride ? Promise.resolve(options.goalOverride) : resolvePatientGoal(db, patientId),
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
    goalOverride?: TWeeklyNutritionGoal;
    referenceDate?: Date;
  },
) {
  const insight = await generateWeeklyNutritionInsight(db, patientId, options);
  return saveWeeklyNutritionInsight(db, insight);
}

export async function runWeeklyNutritionInsightsForActivePatients(
  db: Db,
  options?: {
    goalOverride?: TWeeklyNutritionGoal;
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
