import type { Db, ObjectId } from "mongodb";

import {
  getNutritionLevelLabel,
  getNutritionTrend,
  NUTRITION_MONTHLY_PATIENT_SUMMARY_COLLECTION,
  type NutritionMonthlyPatientSummaryDoc,
} from "@/apps/api/lib/portal/nutritionMonthlySummary";
import type { PortalNutritionFilter } from "@/apps/api/lib/portal/patient-shared";
import type { NutritionEntryDoc } from "@/apps/api/lib/types/dashboard";
import { getMappedNutritionTargets } from "@/apps/api/lib/utils/targets";
import { COLLECTIONS } from "@ckd/core/server";

const SUMMARY_METRICS: PortalNutritionFilter[] = [
  "caloriesKcal",
  "phosphorusMg",
  "potassiumMg",
  "proteinG",
  "sodiumMg",
];

type FoodMetricAggregate = {
  timesLogged: number;
  totals: Partial<Record<PortalNutritionFilter, number>>;
};

function startOfMonthUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(date: Date, delta: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function resolveEntryDate(entry: Pick<NutritionEntryDoc, "createdAt" | "eatenAt">) {
  return entry.eatenAt ?? entry.createdAt ?? null;
}

function getMetricValue(
  source: Record<string, unknown> | undefined,
  metric: PortalNutritionFilter,
) {
  const value = source?.[metric];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function accumulateFoodMetric(
  map: Map<string, FoodMetricAggregate>,
  food: string,
  metric: PortalNutritionFilter,
  amount: number,
) {
  if (amount <= 0) return;
  const current = map.get(food) ?? {
    timesLogged: 0,
    totals: {},
  };
  current.timesLogged += 1;
  current.totals[metric] = (current.totals[metric] ?? 0) + amount;
  map.set(food, current);
}

function buildTopFoodsForMetric(
  currentFoods: Map<string, FoodMetricAggregate>,
  previousFoods: Map<string, FoodMetricAggregate>,
  metric: PortalNutritionFilter,
) {
  return Array.from(currentFoods.entries())
    .map(([food, aggregate]) => {
      const currentMonthAmount = round1(aggregate.totals[metric] ?? 0);
      if (currentMonthAmount <= 0) {
        return null;
      }

      const averageAmount =
        aggregate.timesLogged > 0
          ? round1(currentMonthAmount / aggregate.timesLogged)
          : 0;
      const previousMonthAmount = round1(
        previousFoods.get(food)?.totals?.[metric] ?? 0,
      );

      return {
        averageAmount,
        food,
        levelLabel: getNutritionLevelLabel(metric, averageAmount),
        previousMonthAmount,
        timesLogged: aggregate.timesLogged,
        totalAmount: currentMonthAmount,
        trend: getNutritionTrend(currentMonthAmount, previousMonthAmount),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => {
      if (right.totalAmount !== left.totalAmount) {
        return right.totalAmount - left.totalAmount;
      }
      return right.timesLogged - left.timesLogged;
    })
    .slice(0, 8);
}

export async function recomputeNutritionMonthlySummary(
  db: Db,
  {
    month,
    orgId,
    patientId,
    seedPrincipalId,
  }: {
    month: Date | string;
    orgId?: string;
    patientId: ObjectId;
    seedPrincipalId: string;
  },
) {
  const monthStart =
    typeof month === "string"
      ? new Date(`${month}-01T00:00:00.000Z`)
      : startOfMonthUtc(month);

  if (Number.isNaN(monthStart.getTime())) {
    throw new Error("Invalid summary month");
  }

  const monthId = monthKey(monthStart);
  const monthEnd = addMonths(monthStart, 1);
  const previousMonthStart = addMonths(monthStart, -1);

  const [entries, previousEntries, targets] = await Promise.all([
    db
      .collection<NutritionEntryDoc>(COLLECTIONS.NutritionLedger)
      .find(
        {
          patientId,
          $or: [
            { eatenAt: { $gte: monthStart, $lt: monthEnd } },
            { eatenAt: null, createdAt: { $gte: monthStart, $lt: monthEnd } },
            {
              eatenAt: { $exists: false },
              createdAt: { $gte: monthStart, $lt: monthEnd },
            },
          ],
        },
        {
          projection: {
            _id: 1,
            createdAt: 1,
            eatenAt: 1,
            items: 1,
            totals: 1,
          },
        },
      )
      .toArray(),
    db
      .collection<NutritionEntryDoc>(COLLECTIONS.NutritionLedger)
      .find(
        {
          patientId,
          $or: [
            {
              eatenAt: { $gte: previousMonthStart, $lt: monthStart },
            },
            {
              eatenAt: null,
              createdAt: { $gte: previousMonthStart, $lt: monthStart },
            },
            {
              eatenAt: { $exists: false },
              createdAt: { $gte: previousMonthStart, $lt: monthStart },
            },
          ],
        },
        {
          projection: {
            _id: 1,
            createdAt: 1,
            eatenAt: 1,
            items: 1,
            totals: 1,
          },
        },
      )
      .toArray(),
    getMappedNutritionTargets(db, patientId, {
      orgId,
      seedPrincipalId,
    }),
  ]);

  const summaryCollection = db.collection<NutritionMonthlyPatientSummaryDoc>(
    NUTRITION_MONTHLY_PATIENT_SUMMARY_COLLECTION,
  );

  if (entries.length === 0) {
    await summaryCollection.deleteOne({ month: monthId, patientId });
    return null;
  }

  const daysLogged = new Set<string>();
  const totals: Partial<Record<PortalNutritionFilter, number>> = {};
  const currentFoods = new Map<string, FoodMetricAggregate>();
  const previousFoods = new Map<string, FoodMetricAggregate>();

  for (const metric of SUMMARY_METRICS) {
    totals[metric] = 0;
  }

  for (const entry of entries) {
    const date = resolveEntryDate(entry);
    if (!date) continue;
    daysLogged.add(dayKey(date));

    for (const metric of SUMMARY_METRICS) {
      totals[metric] = round1((totals[metric] ?? 0) + getMetricValue(entry.totals, metric));
    }

    for (const item of entry.items ?? []) {
      const food = item.name?.trim();
      if (!food) continue;
      for (const metric of SUMMARY_METRICS) {
        accumulateFoodMetric(
          currentFoods,
          food,
          metric,
          getMetricValue(item.nutrients, metric),
        );
      }
    }
  }

  for (const entry of previousEntries) {
    for (const item of entry.items ?? []) {
      const food = item.name?.trim();
      if (!food) continue;
      for (const metric of SUMMARY_METRICS) {
        accumulateFoodMetric(
          previousFoods,
          food,
          metric,
          getMetricValue(item.nutrients, metric),
        );
      }
    }
  }

  const dayCount = Math.max(daysLogged.size, 1);
  const dailyAverages = Object.fromEntries(
    SUMMARY_METRICS.map((metric) => [metric, round1((totals[metric] ?? 0) / dayCount)]),
  ) as Partial<Record<PortalNutritionFilter, number>>;

  const topFoods = Object.fromEntries(
    SUMMARY_METRICS.map((metric) => [
      metric,
      buildTopFoodsForMetric(currentFoods, previousFoods, metric),
    ]),
  ) as NutritionMonthlyPatientSummaryDoc["topFoods"];

  const now = new Date();

  await summaryCollection.updateOne(
    { month: monthId, patientId },
    {
      $set: {
        dailyAverages,
        daysLogged: daysLogged.size,
        generatedAt: now,
        month: monthId,
        patientId,
        sourceVersion: 1,
        targetSnapshot: targets,
        topFoods,
        totals,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true },
  );

  return {
    dailyAverages,
    daysLogged: daysLogged.size,
    month: monthId,
    topFoods,
    totals,
  };
}
