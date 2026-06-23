import type { Db, Filter, ObjectId } from "mongodb";

import {
  WORSENING_TREND_RULES,
  type PatientWorseningTrendAlert,
  type WorseningEscalationLevel,
} from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";
import {
  findTargetsCurrentDoc,
  resolveTargetValue,
  type TargetsCurrentDoc,
  type TargetStateLike,
} from "./targets";

type MeasurementDoc = {
  _id: ObjectId;
  count?: number | null;
  diastolicMmHg?: number | null;
  kind?: string | null;
  measuredAt?: Date | string | null;
  patientId?: ObjectId | string | null;
  source?: string | null;
  systolicMmHg?: number | null;
  valueKg?: number | null;
};

type DailyStepsPoint = {
  count: number;
  dateKey: string;
};

type BloodPressurePoint = {
  dateKey: string;
  diastolicMmHg: number;
  measuredAt: string;
  systolicMmHg: number;
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

type BloodPressureUpEvaluation = {
  currentAverageDiastolic: number;
  currentAverageSystolic: number;
  deltaSystolic: number;
  previousAverageDiastolic: number;
  previousAverageSystolic: number;
  systolicAboveTargetBy: number | null;
  systolicTargetValue: number | null;
  triggered: boolean;
  window: { endDate: string; startDate: string };
};

type WeightTrendEvaluation = {
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

function shouldUseProviderBloodPressureForWorsening() {
  return process.env.NODE_ENV === "production";
}

async function resolveTargetMetricValue(
  db: Db,
  patientId: ObjectId,
  metrics: string[],
) {
  const doc = (await findTargetsCurrentDoc(
    db,
    patientId,
  )) as TargetsCurrentDoc | null;

  const entries = Object.entries(doc?.targets ?? {});
  const metricSet = new Set(metrics);
  for (const [key, value] of entries) {
    if (metricSet.has(key)) {
      return resolveTargetValue(value, null);
    }
    if (
      value &&
      typeof value === "object" &&
      typeof value.metric === "string" &&
      metricSet.has(value.metric)
    ) {
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

  const recentPoints = toStepsWindow(
    input.dailyPoints,
    recentStart,
    recentEndExclusive,
  );
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

export function evaluateBloodPressureUpTrend(input: {
  now?: Date;
  points: BloodPressurePoint[];
  systolicTargetValue?: number | null;
}): BloodPressureUpEvaluation {
  const now = startOfUtcDay(input.now ?? new Date());
  const recentStart = addUtcDays(now, -7);
  const previousStart = addUtcDays(recentStart, -28);
  const previousEndExclusive = recentStart;
  const recentEndExclusive = addUtcDays(now, 1);
  const points = input.points
    .slice()
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  const recentPoints = points.filter((point) => {
    const pointMs = new Date(point.measuredAt).getTime();
    return pointMs >= recentStart.getTime() && pointMs < recentEndExclusive.getTime();
  });
  const previousPoints = points.filter((point) => {
    const pointMs = new Date(point.measuredAt).getTime();
    return pointMs >= previousStart.getTime() && pointMs < previousEndExclusive.getTime();
  });

  if (recentPoints.length < 2 || previousPoints.length < 8) {
    return {
      currentAverageDiastolic: 0,
      currentAverageSystolic: 0,
      deltaSystolic: 0,
      previousAverageDiastolic: 0,
      previousAverageSystolic: 0,
      systolicAboveTargetBy: null,
      systolicTargetValue: input.systolicTargetValue ?? null,
      triggered: false,
      window: { endDate: isoDay(now), startDate: isoDay(recentStart) },
    };
  }

  const currentAverageSystolic = average(
    recentPoints.map((point) => point.systolicMmHg),
  );
  const previousAverageSystolic = average(
    previousPoints.map((point) => point.systolicMmHg),
  );
  const currentAverageDiastolic = average(
    recentPoints.map((point) => point.diastolicMmHg),
  );
  const previousAverageDiastolic = average(
    previousPoints.map((point) => point.diastolicMmHg),
  );
  const deltaSystolic = currentAverageSystolic - previousAverageSystolic;
  const systolicAboveTargetBy =
    input.systolicTargetValue !== null && input.systolicTargetValue !== undefined
      ? currentAverageSystolic - input.systolicTargetValue
      : null;

  return {
    currentAverageDiastolic: round(currentAverageDiastolic),
    currentAverageSystolic: round(currentAverageSystolic),
    deltaSystolic: round(deltaSystolic),
    previousAverageDiastolic: round(previousAverageDiastolic),
    previousAverageSystolic: round(previousAverageSystolic),
    systolicAboveTargetBy:
      systolicAboveTargetBy === null ? null : round(systolicAboveTargetBy),
    systolicTargetValue: input.systolicTargetValue ?? null,
    triggered:
      deltaSystolic >= 15 ||
      (systolicAboveTargetBy !== null && systolicAboveTargetBy >= 10),
    window: { endDate: isoDay(now), startDate: isoDay(recentStart) },
  };
}

export function evaluateWeightTrend(input: {
  direction: "decrease" | "increase";
  now?: Date;
  points: WeightPoint[];
}): WeightTrendEvaluation {
  const now = startOfUtcDay(input.now ?? new Date());
  const windowStart = addUtcDays(now, -7);
  const windowEndExclusive = addUtcDays(now, 1);
  const points = input.points
    .filter((point) => {
      const pointMs = new Date(point.measuredAt).getTime();
      return (
        pointMs >= windowStart.getTime() &&
        pointMs < windowEndExclusive.getTime()
      );
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
  const rawChangeKg =
    input.direction === "increase"
      ? last.valueKg - first.valueKg
      : first.valueKg - last.valueKg;

  return {
    changeKg: round(rawChangeKg),
    currentWeightKg: round(last.valueKg),
    previousWeightKg: round(first.valueKg),
    triggered: rawChangeKg >= 2,
    window: { endDate: isoDay(now), startDate: isoDay(windowStart) },
  };
}

export function evaluateWeightIncreaseTrend(input: {
  now?: Date;
  points: WeightPoint[];
}) {
  return evaluateWeightTrend({ ...input, direction: "increase" });
}

export function evaluateWeightDecreaseTrend(input: {
  now?: Date;
  points: WeightPoint[];
}) {
  return evaluateWeightTrend({ ...input, direction: "decrease" });
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
    const count =
      typeof measurement.count === "number" ? measurement.count : null;
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
      if (
        !measuredAt ||
        Number.isNaN(measuredAt.getTime()) ||
        valueKg === null
      ) {
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

async function loadBloodPressurePoints(db: Db, patientId: ObjectId, now: Date) {
  const from = addUtcDays(startOfUtcDay(now), -41);
  const includeProviderBloodPressure = shouldUseProviderBloodPressureForWorsening();
  const measurements = await db
    .collection<MeasurementDoc>(COLLECTIONS.MeasurementsLedger)
    .find(
      {
        kind: "blood_pressure",
        measuredAt: { $gte: from, $lt: addUtcDays(startOfUtcDay(now), 1) },
        patientId,
        ...(includeProviderBloodPressure ? {} : { source: "patient" }),
      } satisfies Filter<MeasurementDoc>,
      { projection: { diastolicMmHg: 1, measuredAt: 1, systolicMmHg: 1 } },
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
      const systolicMmHg =
        typeof measurement.systolicMmHg === "number"
          ? measurement.systolicMmHg
          : null;
      const diastolicMmHg =
        typeof measurement.diastolicMmHg === "number"
          ? measurement.diastolicMmHg
          : null;
      if (
        !measuredAt ||
        Number.isNaN(measuredAt.getTime()) ||
        systolicMmHg === null ||
        diastolicMmHg === null
      ) {
        return null;
      }
      return {
        dateKey: isoDay(measuredAt),
        diastolicMmHg,
        measuredAt: measuredAt.toISOString(),
        systolicMmHg,
      } satisfies BloodPressurePoint;
    })
    .filter((point): point is BloodPressurePoint => point !== null)
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
}

function buildAlert(input: {
  id: string;
  body: string;
  detail: string;
  detectedAt: string;
  key: PatientWorseningTrendAlert["key"];
  level: WorseningEscalationLevel;
  portalEscalationEligible?: boolean;
  repeatAtLocalTime?: string | null;
  repeatUntil?: string | null;
  screen: string;
  title: string;
}): PatientWorseningTrendAlert {
  return {
    id: input.id,
    body: input.body,
    detail: input.detail,
    detectedAt: input.detectedAt,
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

  const [dailySteps, stepsTarget, weightPoints, bloodPressurePoints, systolicTarget] =
    await Promise.all([
    loadDailyStepsPoints(db, input.patientId, now),
    resolveTargetMetricValue(db, input.patientId, ["steps_per_day"]),
    loadWeightPoints(db, input.patientId, now),
    loadBloodPressurePoints(db, input.patientId, now),
    resolveTargetMetricValue(db, input.patientId, [
      "blood_pressure_systolic",
      "systolicMmHg",
      "systolic_mmhg",
    ]),
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
        id: `steps_decline:${stepsEvaluation.window.startDate}:${stepsEvaluation.window.endDate}`,
        body: "Your recent activity is below your normal baseline. Aim to move towards your daily target today.",
        detail: `7-day average ${Math.round(stepsEvaluation.currentAverage).toLocaleString()} steps vs previous 28-day average ${Math.round(stepsEvaluation.previousAverage).toLocaleString()} steps.`,
        detectedAt: new Date().toISOString(),
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

  const weightIncreaseEvaluation = evaluateWeightIncreaseTrend({
    now,
    points: weightPoints,
  });

  if (weightIncreaseEvaluation.triggered) {
    const portalEscalationEligible = weightIncreaseEvaluation.changeKg >= 4;
    alerts.push(
      buildAlert({
        id: `weight_increase:${weightIncreaseEvaluation.window.startDate}:${weightIncreaseEvaluation.window.endDate}:${weightIncreaseEvaluation.currentWeightKg.toFixed(1)}`,
        body: "Your weight is up this week. Review meals, salt, fluid intake, and your care-plan tasks.",
        detail: `Weight increased by ${weightIncreaseEvaluation.changeKg.toFixed(1)} kg over the last 7 days (${weightIncreaseEvaluation.previousWeightKg.toFixed(1)} kg to ${weightIncreaseEvaluation.currentWeightKg.toFixed(1)} kg).`,
        detectedAt: new Date().toISOString(),
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

  const weightDecreaseEvaluation = evaluateWeightDecreaseTrend({
    now,
    points: weightPoints,
  });

  if (weightDecreaseEvaluation.triggered) {
    const portalEscalationEligible = weightDecreaseEvaluation.changeKg >= 4;
    alerts.push(
      buildAlert({
        id: `weight_decrease:${weightDecreaseEvaluation.window.startDate}:${weightDecreaseEvaluation.window.endDate}:${weightDecreaseEvaluation.currentWeightKg.toFixed(1)}`,
        body: "Your weight is down this week. Review appetite, food intake, recent illness, and your care-plan tasks.",
        detail: `Weight decreased by ${weightDecreaseEvaluation.changeKg.toFixed(1)} kg over the last 7 days (${weightDecreaseEvaluation.previousWeightKg.toFixed(1)} kg to ${weightDecreaseEvaluation.currentWeightKg.toFixed(1)} kg).`,
        detectedAt: new Date().toISOString(),
        key: "weight_decrease",
        level: portalEscalationEligible
          ? "level_3_escalate"
          : "level_2_check_in",
        portalEscalationEligible,
        repeatAtLocalTime: null,
        repeatUntil: null,
        screen: "/(fitness)/fitness-details",
        title: "Weight down this week",
      }),
    );
  }

  const bloodPressureEvaluation = evaluateBloodPressureUpTrend({
    now,
    points: bloodPressurePoints,
    systolicTargetValue: systolicTarget,
  });

  if (bloodPressureEvaluation.triggered) {
    const portalEscalationEligible =
      bloodPressureEvaluation.deltaSystolic >= 20 &&
      (bloodPressureEvaluation.systolicAboveTargetBy ?? 0) > 0;
    alerts.push(
      buildAlert({
        id: `blood_pressure_up:${bloodPressureEvaluation.window.startDate}:${bloodPressureEvaluation.window.endDate}:${bloodPressureEvaluation.currentAverageSystolic.toFixed(1)}`,
        body: "Your blood pressure trend is higher than usual. Review salt intake, medication, symptoms, and today's plan.",
        detail: `7-day average ${Math.round(bloodPressureEvaluation.currentAverageSystolic)}/${Math.round(bloodPressureEvaluation.currentAverageDiastolic)} mmHg vs previous 28-day average ${Math.round(bloodPressureEvaluation.previousAverageSystolic)}/${Math.round(bloodPressureEvaluation.previousAverageDiastolic)} mmHg.`,
        detectedAt: new Date().toISOString(),
        key: "blood_pressure_up",
        level: portalEscalationEligible
          ? "level_3_escalate"
          : "level_2_check_in",
        portalEscalationEligible,
        repeatAtLocalTime: null,
        repeatUntil: null,
        screen: "/(tabs)/measurements",
        title: "Blood pressure up",
      }),
    );
  }

  return alerts;
}
