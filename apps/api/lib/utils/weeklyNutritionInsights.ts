import OpenAI from "openai";
import {
  TWeeklyNutritionAnalysisMode,
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
  contribution: number;
  food: string;
  nutrientAmount: number;
};

const OPENAI_SUMMARY_MODEL = "gpt-4.1-mini";
const CONTRIBUTOR_LIMIT = 3;
const OPENAI_SUMMARY_ATTEMPT_LIMIT = 3;
const BANNED_SUMMARY_PATTERNS = [
  /\btry\b/i,
  /\binstead\b/i,
  /\bswap\b/i,
  /\bswaps\b/i,
  /\breplace\b/i,
  /\breplaces\b/i,
  /\breplacing\b/i,
] as const;

function toWeeklyNutritionInsight(value: Record<string, unknown>) {
  const { _id: _ignored, suggestions: _legacySuggestions, ...doc } = value;
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

function countLoggedDays(entries: NutritionEntryDoc[]) {
  return new Set(
    entries
      .map((entry) => entry.eatenAt)
      .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()))
      .map((value) => toDateOnly(startOfDayUtc(value))),
  ).size;
}

function metricValueForAnalysis(
  entries: NutritionEntryDoc[],
  metricKey: NutrientMetricKey,
  analysisMode: TWeeklyNutritionAnalysisMode,
  loggedDays: number,
) {
  if (analysisMode === "logged_day_average" && loggedDays > 0) {
    return sumMetric(entries, metricKey) / loggedDays;
  }
  return averageDailyMetric(entries, metricKey);
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
      };
      bucket.nutrientAmount += amount;
      buckets.set(key, bucket);
    }
  }

  return Array.from(buckets.values())
    .sort((a, b) => b.nutrientAmount - a.nutrientAmount)
    .slice(0, CONTRIBUTOR_LIMIT)
    .map((bucket) => ({
      contribution: round((bucket.nutrientAmount / total) * 100),
      food: bucket.canonicalName,
      nutrientAmount: round(bucket.nutrientAmount),
    }));
}

function buildFallbackHumanMessage(summary: {
  analysisMode: TWeeklyNutritionAnalysisMode;
  findings: TWeeklyNutritionInsight["findings"];
  goal: TWeeklyNutritionGoal;
  loggedDays: number;
}) {
  const parts: string[] = [];

  if (summary.analysisMode === "insufficient_data") {
    return `You logged meals on ${summary.loggedDays} of 7 days this week, so this summary may not reflect your usual intake yet.`;
  }

  for (const finding of summary.findings) {
    const nutrient = finding.type.replace(/^high_/, "").replace(/^low_/, "");
    const comparator = finding.type.startsWith("low_") ? "below" : "above";
    const foods =
      finding.topFoods.length > 0 ? `, mainly from ${finding.topFoods.join(" and ")}` : "";
    const prefix =
      summary.analysisMode === "logged_day_average"
        ? "On the days you logged, your average"
        : "Your average daily";
    parts.push(
      `${prefix} ${nutrient.replace(/_/g, " ")} intake was ${comparator} target this week${foods}.`,
    );
  }

  return parts.join(" ").trim() || "Your weekly nutrition summary is ready.";
}

function getWeeklyNutritionSummaryGuardIssue(text: string) {
  for (const pattern of BANNED_SUMMARY_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[0]) {
      return `Contains banned wording: "${match[0]}"`;
    }
  }
  return null;
}

function isValidWeeklyNutritionSummary(text: string) {
  return !getWeeklyNutritionSummaryGuardIssue(text);
}

async function buildHumanMessage(summary: {
  analysisMode: TWeeklyNutritionAnalysisMode;
  findings: TWeeklyNutritionInsight["findings"];
  goal: TWeeklyNutritionGoal;
  loggedDays: number;
}) {
  if (!process.env.OPENAI_API_KEY) {
    return buildFallbackHumanMessage(summary);
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const basePrompt = [
      "Write a short, human-friendly weekly nutrition summary.",
      "Do not invent findings.",
      "Do not give advice, recommendations, alternatives, substitutions, or food swaps.",
      'Do not use the words "try", "instead", "swap", or "replace", including simple variants.',
      "Use the provided goal only as tone/context.",
      "Keep it to 2-4 sentences.",
      "Mention the top food contributors plainly.",
      "The actual and target values are average daily amounts across the completed week, not single-day values.",
      "If analysisMode is logged_day_average, make clear the interpretation is based on logged days only.",
      "If analysisMode is insufficient_data, do not give nutrient advice and explain there were too few logged days for a reliable weekly interpretation.",
      JSON.stringify(summary),
    ].join("\n");

    let lastValidText: string | null = null;

    for (let attempt = 0; attempt < OPENAI_SUMMARY_ATTEMPT_LIMIT; attempt += 1) {
      const prompt: string =
        attempt === 0
          ? basePrompt
          : [
              basePrompt,
              `Your previous answer failed validation. ${getWeeklyNutritionSummaryGuardIssue(lastValidText ?? "") ?? "Do not use banned wording."}`,
              "Regenerate the full summary and comply exactly.",
            ].join("\n\n");

      const response = await openai.responses.create({
        input: prompt,
        model: OPENAI_SUMMARY_MODEL,
      });

      const text = response.output_text?.trim();
      if (!text) {
        continue;
      }

      lastValidText = text;
      if (isValidWeeklyNutritionSummary(text)) {
        return text;
      }
    }

    return buildFallbackHumanMessage(summary);
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

  const loggedDays = countLoggedDays(entries);
  const analysisMode: TWeeklyNutritionAnalysisMode =
    loggedDays >= 5
      ? "weekly_average"
      : loggedDays >= 3
        ? "logged_day_average"
        : "insufficient_data";

  const findings: TWeeklyNutritionInsight["findings"] = [];

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

  if (analysisMode === "insufficient_data") {
    findings.push({
      type: "insufficient_logging",
      severity: "low",
      actual: loggedDays,
      target: 5,
      topFoods: [],
      topContributors: [],
    });
  } else {
    for (const check of nutrientChecks) {
      if (typeof check.target !== "number" || check.target <= 0) continue;
      const actual = round(
        metricValueForAnalysis(entries, check.metricKey, analysisMode, loggedDays),
      );
      if (!check.when(actual, check.target)) continue;

      const topContributors = collectTopContributors(
        entries,
        check.metricKey,
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
    }
  }

  const humanMessage = await buildHumanMessage({
    analysisMode,
    findings,
    goal,
    loggedDays,
  });

  return WeeklyNutritionInsight.parse({
    analysisMode,
    patientId: patientId.toString(),
    weekStart: toDateOnly(weekStart),
    weekEnd: toDateOnly(weekEnd),
    goal,
    loggedDays,
    findings,
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
  const { createdAt: createdAtInput, ...insightWithoutCreatedAt } = insight;
  const createdAt = createdAtInput ?? now;

  await collection.updateOne(
    {
      patientId: insight.patientId,
      weekStart: insight.weekStart,
      weekEnd: insight.weekEnd,
    },
    {
      $set: {
        ...insightWithoutCreatedAt,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt,
      },
    },
    { upsert: true },
  );

  return WeeklyNutritionInsight.parse({
    ...insightWithoutCreatedAt,
    createdAt,
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
