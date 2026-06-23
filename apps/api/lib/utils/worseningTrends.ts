import type { Db, Filter, ObjectId } from "mongodb";

import { type WorseningEscalationLevel, WORSENING_TREND_RULES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";
import {
  findTargetsCurrentDoc,
  resolveTargetValue,
  type TargetStateLike,
  type TargetsCurrentDoc,
} from "./targets";

type MeasurementDoc = {
  _id: ObjectId;
  count?: number | null;
  kind?: string | null;
  measuredAt?: Date | string | null;
  patientId?: ObjectId | string | null;
  valueKg?: number | null;
};

type PatientWorseningTrendAlert = {
  body: string;
  detail: string | null;
  detectedAt: string;
  id: string;
  key: "steps_decline" | "weight_increase";
  level: WorseningEscalationLevel;
  portalEscalationEligible: boolean;
  repeatAtLocalTime: string | null;
  repeatUntil: string | null;
  screen: string;
  title: string;
};

type DailyStepsPoint = {
  count: number;
  dateKey: string;
};

type WeightPoint = {
  dateKey: string;
  measuredAt: string;
  valueKg: number;
};

type StepsDeclineEvaluation = {
  currentAverage: number;
  declinePct: number;
  previousAverage: number;
  targetValue: number | null;
  triggered: boolean;
  window: { endDate: string; startDate: string };
};

type WeightIncreaseEvaluation = {
  changeKg: number;
  currentWeightKg: number;
  previousWeightKg: number;
  triggered: boolean;
  window: { endDate: string; startDate: string };
};

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfUtcDay(date: Date) {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

async function resolveStepsTarget(db: Db, patientId: ObjectId) {
  const doc = (await findTargetsCurrentDoc(db, patientId)) as TargetsCurrentDoc | null;

  const entries = Object.entries(doc?.targets ?? {});
  for (const [key, value] of entries) {
    if (key === "steps_per_day") {
      return resolveTargetValue(value, null);
    }
    if (value && typeof value === "object" && value.metric === "steps_per_day") {
      return resolveTargetValue(value as TargetStateLike, null);
    }
  }

  return null;
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toStepsWindow(
  dailyPoints: DailyStepsPoint[],
  windowStart: Date,
  windowEndExclusive: Date,
) {
  const startMs = windowStart.getTime();
  const endMs = windowEndExclusive.getTime();
  return dailyPoints.filter((point) => {
    const pointMs = new Date(`${point.dateKey}T00:00:00.000Z`).getTime();
    return pointMs >= startMs && pointMs < endMs;
  });
}

export function evaluateStepsDeclineTrend(input: {
  dailyPoints: DailyStepsPoint[];
  now?: Date;
  targetValue?: number | null;
}): StepsDeclineEvaluation {
  const now = startOfUtcDay(input.now ?? new Date());
  const recentStart = addUtcDays(now, -6);
  const previousStart = addUtcDays(recentStart, -28);
  const previousEndExclusive = recentStart;
  const recentEndExclusive = addUtcDays(now, 1);

  const recentPoints = toStepsWindow(input.dailyPoints, recentStart, recentEndExclusive);
  const previousPoints = toStepsWindow(
    input.dailyPoints,
    previousStart,
    previousEndExclusive,
  );

  if (recentPoints.length < 4 || previousPoints.length < 14) {
    return {
      currentAverage: 0,
      declinePct: 0,
      previousAverage: 0,
      targetValue: input.targetValue ?? null,
      triggered: false,
      window: { endDate: isoDay(now), startDate: isoDay(recentStart) },
    };
  }

  const currentAverage = average(recentPoints.map((point) => point.count));
  const previousAverage = average(previousPoints.map((point) => point.count));
  const declinePct =
    previousAverage > 0
      ? ((previousAverage - currentAverage) / previousAverage) * 100
      : 0;

  return {
    currentAverage: round(currentAverage),
    declinePct: round(declinePct),
    previousAverage: round(previousAverage),
    targetValue: input.targetValue ?? null,
    triggered: previousAverage > 0 && currentAverage <= previousAverage * 0.7,
    window: { endDate: isoDay(now), startDate: isoDay(recentStart) },
  };
}

export function evaluateWeightIncreaseTrend(input: {
  now?: Date;
  points: WeightPoint[];
}): WeightIncreaseEvaluation {
  const now = startOfUtcDay(input.now ?? new Date());
  const windowStart = addUtcDays(now, -6);
  const windowEndExclusive = addUtcDays(now, 1);
  const points = input.points
    .filter((point) => {
      const pointMs = new Date(point.measuredAt).getTime();
      return pointMs >= windowStart.getTime() && pointMs < windowEndExclusive.getTime();
    })
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));

  if (points.length < 2) {
    return {
      changeKg: 0,
      currentWeightKg: 0,
      previousWeightKg: 0,
      triggered: false,
      window: { endDate: isoDay(now), startDate: isoDay(windowStart) },
    };
  }

  const first = points[0];
  const last = points[points.length - 1];
  const changeKg = last.valueKg - first.valueKg;

  return {
    changeKg: round(changeKg),
    currentWeightKg: round(last.valueKg),
    previousWeightKg: round(first.valueKg),
    triggered: changeKg >= 2,
    window: { endDate: isoDay(now), startDate: isoDay(windowStart) },
  };
}

async function loadDailyStepsPoints(db: Db, patientId: ObjectId, now: Date) {
  const from = addUtcDays(startOfUtcDay(now), -34);
  const measurements = await db
    .collection<MeasurementDoc>(COLLECTIONS.MeasurementsLedger)
    .find(
      {
        kind: "steps",
        measuredAt: { $gte: from, $lt: addUtcDays(startOfUtcDay(now), 1) },
        patientId,
      },
      { projection: { count: 1, measuredAt: 1 } },
    )
    .toArray();

  const byDay = new Map<string, number>();
  for (const measurement of measurements) {
    const measuredAt =
      measurement.measuredAt instanceof Date
        ? measurement.measuredAt
        : typeof measurement.measuredAt === "string"
          ? new Date(measurement.measuredAt)
          : null;
    const count = typeof measurement.count === "number" ? measurement.count : null;
    if (!measuredAt || Number.isNaN(measuredAt.getTime()) || count === null) {
      continue;
    }
    const dayKey = isoDay(measuredAt);
    byDay.set(dayKey, Math.max(count, byDay.get(dayKey) ?? 0));
  }

  return Array.from(byDay.entries())
    .map(([dateKey, count]) => ({ count, dateKey }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

async function loadWeightPoints(db: Db, patientId: ObjectId, now: Date) {
  const from = addUtcDays(startOfUtcDay(now), -13);
  const measurements = await db
    .collection<MeasurementDoc>(COLLECTIONS.MeasurementsLedger)
    .find(
      {
        kind: "weight",
        measuredAt: { $gte: from, $lt: addUtcDays(startOfUtcDay(now), 1) },
        patientId,
      } satisfies Filter<MeasurementDoc>,
      { projection: { measuredAt: 1, valueKg: 1 } },
    )
    .toArray();

  return measurements
    .map((measurement) => {
      const measuredAt =
        measurement.measuredAt instanceof Date
          ? measurement.measuredAt
          : typeof measurement.measuredAt === "string"
            ? new Date(measurement.measuredAt)
            : null;
      const valueKg =
        typeof measurement.valueKg === "number" ? measurement.valueKg : null;
      if (!measuredAt || Number.isNaN(measuredAt.getTime()) || valueKg === null) {
        return null;
      }
      return {
        dateKey: isoDay(measuredAt),
        measuredAt: measuredAt.toISOString(),
        valueKg,
      } satisfies WeightPoint;
    })
    .filter((point): point is WeightPoint => point !== null)
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
}

function buildAlert(input: {
  body: string;
  detail: string;
  detectedAt: string;
  id: string;
  key: PatientWorseningTrendAlert["key"];
  level: WorseningEscalationLevel;
  portalEscalationEligible?: boolean;
  repeatAtLocalTime?: string | null;
  repeatUntil?: string | null;
  screen: string;
  title: string;
}): PatientWorseningTrendAlert {
  return {
    body: input.body,
    detail: input.detail,
    detectedAt: input.detectedAt,
    id: input.id,
    key: input.key,
    level: input.level,
    portalEscalationEligible: Boolean(input.portalEscalationEligible),
    repeatAtLocalTime: input.repeatAtLocalTime ?? null,
    repeatUntil: input.repeatUntil ?? null,
    screen: input.screen,
    title: input.title,
  };
}

export async function getActivePatientWorseningTrendAlerts(
  db: Db,
  input: { now?: Date; patientId: ObjectId },
) {
  const now = input.now ?? new Date();
  const alerts: PatientWorseningTrendAlert[] = [];

  const [dailySteps, stepsTarget, weightPoints] = await Promise.all([
    loadDailyStepsPoints(db, input.patientId, now),
    resolveStepsTarget(db, input.patientId),
    loadWeightPoints(db, input.patientId, now),
  ]);

  const stepsEvaluation = evaluateStepsDeclineTrend({
    dailyPoints: dailySteps,
    now,
    targetValue: stepsTarget,
  });

  if (stepsEvaluation.triggered) {
    const rule = WORSENING_TREND_RULES.steps_decline;
    alerts.push(
      buildAlert({
        body:
          "Your recent activity is below your normal baseline. Aim to move towards your daily target today.",
        detail: `7-day average ${Math.round(stepsEvaluation.currentAverage).toLocaleString()} steps vs previous 28-day average ${Math.round(stepsEvaluation.previousAverage).toLocaleString()} steps.`,
        detectedAt: new Date().toISOString(),
        id: `steps_decline:${stepsEvaluation.window.startDate}:${stepsEvaluation.window.endDate}`,
        key: "steps_decline",
        level: "level_1_nudge",
        portalEscalationEligible:
          stepsEvaluation.targetValue !== null &&
          stepsEvaluation.currentAverage < stepsEvaluation.targetValue,
        repeatAtLocalTime: rule.appNotification?.repeatAtLocalTime ?? null,
        repeatUntil: rule.appNotification?.repeatUntil ?? null,
        screen: "/(fitness)/fitness-details",
        title: "Activity down",
      }),
    );
  }

  const weightEvaluation = evaluateWeightIncreaseTrend({
    now,
    points: weightPoints,
  });

  if (weightEvaluation.triggered) {
    const portalEscalationEligible = weightEvaluation.changeKg >= 4;
    alerts.push(
      buildAlert({
        body:
          "Your weight is up this week. Review meals, salt, fluid intake, and your care-plan tasks.",
        detail: `Weight increased by ${weightEvaluation.changeKg.toFixed(1)} kg over the last 7 days (${weightEvaluation.previousWeightKg.toFixed(1)} kg to ${weightEvaluation.currentWeightKg.toFixed(1)} kg).`,
        detectedAt: new Date().toISOString(),
        id: `weight_increase:${weightEvaluation.window.startDate}:${weightEvaluation.window.endDate}:${weightEvaluation.currentWeightKg.toFixed(1)}`,
        key: "weight_increase",
        level: portalEscalationEligible
          ? "level_3_escalate"
          : "level_2_check_in",
        portalEscalationEligible,
        repeatAtLocalTime: null,
        repeatUntil: null,
        screen: "/(fitness)/fitness-details",
        title: "Weight up this week",
      }),
    );
  }

  return alerts;
}
