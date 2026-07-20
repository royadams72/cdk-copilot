import type { Db, Filter, ObjectId } from "mongodb";

import {
  type PatientWorseningTrendAlert,
  type TNutritionEntry,
  type TSymptomEntry,
  WORSENING_TREND_RULES,
  type WorseningEscalationLevel,
} from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";
import type {
  TWorseningTrendCheckInDoc,
  TWorseningTrendStateDoc,
} from "@ckd/core/server";
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

type SymptomHistoryEntryDoc = Pick<
  TSymptomEntry,
  "normalizedName" | "recordedAt" | "severity"
> & {
  patientId: ObjectId;
};

type NutritionEntryDoc = Pick<
  TNutritionEntry,
  "eatenAt" | "status" | "totals"
> & {
  patientId: ObjectId;
};

type SymptomsWorseningEvaluation = {
  distinctSymptomDaysPrevious: number;
  distinctSymptomDaysRecent: number;
  repeatedSymptomName: string | null;
  severeRecentCount: number;
  triggered: boolean;
  window: { endDate: string; startDate: string };
};

type NutritionWorseningEvaluation = {
  breachDaysFourteen: number;
  breachDaysRecent: number;
  triggered: boolean;
  window: { endDate: string; startDate: string };
};

type RawWorseningTrendAlert = Omit<
  PatientWorseningTrendAlert,
  "firstDetectedAt" | "id" | "lastDetectedAt" | "viewedAt"
>;

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

function countDistinctUtcDays(dates: Date[]) {
  return new Set(dates.map((date) => isoDay(date))).size;
}

function buildCheckInScreenPath(
  alertId: string,
  key: PatientWorseningTrendAlert["key"],
) {
  return `/worsening-check-in?alertId=${encodeURIComponent(alertId)}&key=${encodeURIComponent(key)}`;
}

function getConcerningWeightIncreaseResponses() {
  return new Set([
    "swelling",
    "breathless",
    "less_urine",
    "other_worsening_symptoms",
    "unknown",
  ]);
}

function getExplainedWeightIncreaseResponses() {
  return new Set([
    "holiday",
    "ate_more",
    "more_salty_food",
    "more_fluid",
    "missed_tasks",
    "trying_to_gain_weight",
  ]);
}

function getConcerningWeightDecreaseResponses() {
  return new Set([
    "poor_appetite",
    "nausea",
    "vomiting",
    "diarrhoea",
    "unwell",
    "other_symptoms",
    "unknown",
  ]);
}

function getConcerningBloodPressureResponses() {
  return new Set(["headache", "swelling", "breathless", "unknown"]);
}

function getExplainedBloodPressureResponses() {
  return new Set([
    "more_salty_food",
    "missed_medication",
    "stress",
    "poor_sleep",
    "illness",
  ]);
}

function buildWorseningEpisodeId(
  key: PatientWorseningTrendAlert["key"],
  now: Date,
) {
  return `${key}:${now.toISOString()}`;
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
    return (
      pointMs >= recentStart.getTime() && pointMs < recentEndExclusive.getTime()
    );
  });
  const previousPoints = points.filter((point) => {
    const pointMs = new Date(point.measuredAt).getTime();
    return (
      pointMs >= previousStart.getTime() &&
      pointMs < previousEndExclusive.getTime()
    );
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
    input.systolicTargetValue !== null &&
    input.systolicTargetValue !== undefined
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

export function evaluateSymptomsWorsening(input: {
  entries: Array<
    Pick<SymptomHistoryEntryDoc, "normalizedName" | "recordedAt" | "severity">
  >;
  now?: Date;
}): SymptomsWorseningEvaluation {
  const now = startOfUtcDay(input.now ?? new Date());
  const recentStart = addUtcDays(now, -7);
  const previousStart = addUtcDays(recentStart, -7);
  const previousEndExclusive = recentStart;
  const recentEndExclusive = addUtcDays(now, 1);

  const entries = input.entries
    .map((entry) => ({
      normalizedName: entry.normalizedName,
      recordedAt:
        entry.recordedAt instanceof Date
          ? entry.recordedAt
          : new Date(entry.recordedAt),
      severity: entry.severity,
    }))
    .filter((entry) => !Number.isNaN(entry.recordedAt.getTime()));

  const recentEntries = entries.filter(
    (entry) =>
      entry.recordedAt.getTime() >= recentStart.getTime() &&
      entry.recordedAt.getTime() < recentEndExclusive.getTime(),
  );
  const previousEntries = entries.filter(
    (entry) =>
      entry.recordedAt.getTime() >= previousStart.getTime() &&
      entry.recordedAt.getTime() < previousEndExclusive.getTime(),
  );

  const distinctSymptomDaysRecent = countDistinctUtcDays(
    recentEntries.map((entry) => entry.recordedAt),
  );
  const distinctSymptomDaysPrevious = countDistinctUtcDays(
    previousEntries.map((entry) => entry.recordedAt),
  );
  const repeatedByName = recentEntries.reduce<Record<string, number>>(
    (acc, entry) => {
      acc[entry.normalizedName] = (acc[entry.normalizedName] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const repeatedSymptomName =
    Object.entries(repeatedByName).find(([, count]) => count >= 3)?.[0] ?? null;
  const severeRecentCount = recentEntries.filter(
    (entry) => entry.severity >= 4,
  ).length;

  return {
    distinctSymptomDaysPrevious,
    distinctSymptomDaysRecent,
    repeatedSymptomName,
    severeRecentCount,
    triggered:
      distinctSymptomDaysRecent >= 4 ||
      distinctSymptomDaysRecent >= distinctSymptomDaysPrevious + 2 ||
      repeatedSymptomName !== null,
    window: { endDate: isoDay(now), startDate: isoDay(recentStart) },
  };
}

export function evaluateNutritionWorsening(input: {
  entries: Array<Pick<NutritionEntryDoc, "eatenAt" | "totals">>;
  now?: Date;
  targets: Partial<
    Record<"phosphorusMg" | "potassiumMg" | "proteinG" | "sodiumMg", number>
  >;
}): NutritionWorseningEvaluation {
  const now = startOfUtcDay(input.now ?? new Date());
  const recentStart = addUtcDays(now, -7);
  const fourteenStart = addUtcDays(now, -14);
  const endExclusive = addUtcDays(now, 1);
  const trackedKeys = [
    "proteinG",
    "phosphorusMg",
    "potassiumMg",
    "sodiumMg",
  ] as const;
  const breachThreshold = 3;
  const availableTargetKeys = trackedKeys.filter(
    (key) => typeof input.targets[key] === "number",
  );

  if (availableTargetKeys.length < 4) {
    return {
      breachDaysFourteen: 0,
      breachDaysRecent: 0,
      triggered: false,
      window: { endDate: isoDay(now), startDate: isoDay(recentStart) },
    };
  }

  const entries = input.entries
    .map((entry) => ({
      eatenAt:
        entry.eatenAt instanceof Date ? entry.eatenAt : new Date(entry.eatenAt),
      totals: entry.totals ?? {},
    }))
    .filter((entry) => !Number.isNaN(entry.eatenAt.getTime()));

  const byDay = new Map<
    string,
    Partial<Record<(typeof trackedKeys)[number], number>>
  >();
  for (const entry of entries) {
    const token = isoDay(entry.eatenAt);
    const current = byDay.get(token) ?? {};
    for (const key of trackedKeys) {
      const value = entry.totals[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        current[key] = (current[key] ?? 0) + value;
      }
    }
    byDay.set(token, current);
  }

  const breachDays = Array.from(byDay.entries()).map(([token, totals]) => {
    let breaches = 0;
    for (const key of availableTargetKeys) {
      const actual = totals[key];
      const target = input.targets[key];
      if (
        typeof actual === "number" &&
        typeof target === "number" &&
        actual > target
      ) {
        breaches += 1;
      }
    }
    return { breaches, token };
  });

  const breachDaysRecent = breachDays.filter(({ breaches, token }) => {
    const pointMs = new Date(`${token}T00:00:00.000Z`).getTime();
    return (
      pointMs >= recentStart.getTime() &&
      pointMs < endExclusive.getTime() &&
      breaches >= breachThreshold
    );
  }).length;
  const breachDaysFourteen = breachDays.filter(({ breaches, token }) => {
    const pointMs = new Date(`${token}T00:00:00.000Z`).getTime();
    return (
      pointMs >= fourteenStart.getTime() &&
      pointMs < endExclusive.getTime() &&
      breaches >= breachThreshold
    );
  }).length;

  return {
    breachDaysFourteen,
    breachDaysRecent,
    triggered: breachDaysRecent >= 6,
    window: { endDate: isoDay(now), startDate: isoDay(recentStart) },
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
  const includeProviderBloodPressure =
    shouldUseProviderBloodPressureForWorsening();
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

async function loadSymptomHistoryEntries(
  db: Db,
  patientId: ObjectId,
  now: Date,
) {
  const from = addUtcDays(startOfUtcDay(now), -21);
  const docs = await db
    .collection<{
      after?: SymptomHistoryEntryDoc;
      patientId: ObjectId;
    }>(COLLECTIONS.SymptomsLedger)
    .find(
      {
        "after.recordedAt": {
          $gte: from,
          $lt: addUtcDays(startOfUtcDay(now), 1),
        },
        patientId,
      },
      {
        projection: {
          "after.normalizedName": 1,
          "after.recordedAt": 1,
          "after.severity": 1,
        },
      },
    )
    .toArray();

  return docs
    .map((doc) => doc.after ?? null)
    .filter((entry): entry is SymptomHistoryEntryDoc => Boolean(entry));
}

async function loadNutritionEntries(db: Db, patientId: ObjectId, now: Date) {
  const from = addUtcDays(startOfUtcDay(now), -21);
  return db
    .collection<NutritionEntryDoc>(COLLECTIONS.NutritionLedger)
    .find(
      {
        eatenAt: { $gte: from, $lt: addUtcDays(startOfUtcDay(now), 1) },
        patientId,
        status: { $ne: "deleted" },
      } as Filter<NutritionEntryDoc>,
      { projection: { eatenAt: 1, totals: 1 } },
    )
    .toArray();
}

async function loadLatestWorseningTrendCheckIns(
  db: Db,
  patientId: ObjectId,
  alertIds: string[],
) {
  if (!alertIds.length) {
    return new Map<string, TWorseningTrendCheckInDoc>();
  }

  const docs = await db
    .collection<TWorseningTrendCheckInDoc>(COLLECTIONS.WorseningTrendCheckIns)
    .find(
      {
        alertId: { $in: alertIds },
        patientId,
      },
      {
        projection: {
          alertId: 1,
          key: 1,
          promptQuestion: 1,
          responseCode: 1,
          responseLabel: 1,
          submittedAt: 1,
        },
      },
    )
    .sort({ submittedAt: -1 })
    .toArray();

  const latestByAlertId = new Map<string, TWorseningTrendCheckInDoc>();
  for (const doc of docs) {
    if (!latestByAlertId.has(doc.alertId)) {
      latestByAlertId.set(doc.alertId, doc);
    }
  }

  return latestByAlertId;
}

async function loadActiveWorseningTrendStates(db: Db, patientId: ObjectId) {
  const docs = await db
    .collection<TWorseningTrendStateDoc>(COLLECTIONS.WorseningTrendStates)
    .find({
      patientId,
      status: "active",
    })
    .toArray();

  return new Map(docs.map((doc) => [doc.key, doc] as const));
}

async function syncWorseningTrendStates(
  db: Db,
  patientId: ObjectId,
  candidateAlerts: RawWorseningTrendAlert[],
  activeStatesByKey: Map<
    PatientWorseningTrendAlert["key"],
    TWorseningTrendStateDoc
  >,
  now: Date,
) {
  const collection = db.collection<TWorseningTrendStateDoc>(
    COLLECTIONS.WorseningTrendStates,
  );
  const nextStateByKey = new Map<
    PatientWorseningTrendAlert["key"],
    TWorseningTrendStateDoc
  >();
  const activeKeys = new Set(candidateAlerts.map((item) => item.key));

  for (const alert of candidateAlerts) {
    const existing = activeStatesByKey.get(alert.key);
    const firstDetectedAt = existing?.firstDetectedAt ?? now;
    const episodeId =
      existing?.episodeId ?? buildWorseningEpisodeId(alert.key, now);
    const viewedAt = existing?.viewedAt ?? null;

    await collection.updateOne(
      existing?._id
        ? {
            _id: existing._id,
          }
        : {
            key: alert.key,
            patientId,
            status: "active",
          },
      {
        $set: {
          body: alert.body,
          detail: alert.detail,
          firstDetectedAt,
          key: alert.key,
          lastDetectedAt: now,
          level: alert.level,
          portalEscalationEligible: alert.portalEscalationEligible,
          repeatAtLocalTime: alert.repeatAtLocalTime ?? null,
          repeatUntil: alert.repeatUntil ?? null,
          resolvedAt: null,
          screen: alert.screen,
          status: "active",
          title: alert.title,
          updatedAt: now,
          viewedAt,
        },
        $setOnInsert: {
          episodeId,
          patientId,
        },
      },
      { upsert: true },
    );

    nextStateByKey.set(alert.key, {
      body: alert.body,
      detail: alert.detail,
      episodeId,
      firstDetectedAt,
      key: alert.key,
      lastDetectedAt: now,
      level: alert.level,
      patientId,
      portalEscalationEligible: alert.portalEscalationEligible,
      repeatAtLocalTime: alert.repeatAtLocalTime ?? null,
      repeatUntil: alert.repeatUntil ?? null,
      resolvedAt: null,
      screen: alert.screen,
      status: "active",
      title: alert.title,
      updatedAt: now,
      viewedAt,
    });
  }

  for (const [key, state] of activeStatesByKey) {
    if (activeKeys.has(key)) {
      continue;
    }

    await collection.updateOne(
      {
        episodeId: state.episodeId,
        patientId,
      },
      {
        $set: {
          resolvedAt: now,
          status: "resolved",
          updatedAt: now,
        },
      },
    );
  }

  return nextStateByKey;
}

function buildAlert(input: {
  id: string;
  body: string;
  checkInResponseCode?: string | null;
  checkInResponseLabel?: string | null;
  checkInSubmittedAt?: string | null;
  detail: string | null;
  detectedAt: string;
  firstDetectedAt: string;
  key: PatientWorseningTrendAlert["key"];
  lastDetectedAt: string;
  level: WorseningEscalationLevel;
  portalEscalationEligible?: boolean;
  repeatAtLocalTime?: string | null;
  repeatUntil?: string | null;
  screen: string;
  title: string;
  viewedAt?: string | null;
}): PatientWorseningTrendAlert {
  return {
    id: input.id,
    body: input.body,
    checkInResponseCode: input.checkInResponseCode ?? null,
    checkInResponseLabel: input.checkInResponseLabel ?? null,
    checkInSubmittedAt: input.checkInSubmittedAt ?? null,
    detail: input.detail ?? null,
    detectedAt: input.detectedAt,
    firstDetectedAt: input.firstDetectedAt,
    key: input.key,
    lastDetectedAt: input.lastDetectedAt,
    level: input.level,
    portalEscalationEligible: Boolean(input.portalEscalationEligible),
    repeatAtLocalTime: input.repeatAtLocalTime ?? null,
    repeatUntil: input.repeatUntil ?? null,
    screen: input.screen,
    title: input.title,
    viewedAt: input.viewedAt ?? null,
  };
}

export async function getActivePatientWorseningTrendAlerts(
  db: Db,
  input: { now?: Date; patientId: ObjectId },
) {
  const now = input.now ?? new Date();

  const [
    activeStatesByKey,
    dailySteps,
    stepsTarget,
    weightPoints,
    bloodPressurePoints,
    systolicTarget,
    symptomHistoryEntries,
  ] = await Promise.all([
    loadActiveWorseningTrendStates(db, input.patientId),
    loadDailyStepsPoints(db, input.patientId, now),
    resolveTargetMetricValue(db, input.patientId, ["steps_per_day"]),
    loadWeightPoints(db, input.patientId, now),
    loadBloodPressurePoints(db, input.patientId, now),
    resolveTargetMetricValue(db, input.patientId, [
      "blood_pressure_systolic",
      "systolicMmHg",
      "systolic_mmhg",
    ]),
    loadSymptomHistoryEntries(db, input.patientId, now),
  ]);

  const stepsEvaluation = evaluateStepsDeclineTrend({
    dailyPoints: dailySteps,
    now,
    targetValue: stepsTarget,
  });
  const candidateEpisodeIdByKey = new Map<
    PatientWorseningTrendAlert["key"],
    string
  >();

  function getEpisodeIdForKey(key: PatientWorseningTrendAlert["key"]) {
    const existing = candidateEpisodeIdByKey.get(key);
    if (existing) {
      return existing;
    }
    const fromState = activeStatesByKey.get(key)?.episodeId;
    const episodeId = fromState ?? buildWorseningEpisodeId(key, now);
    candidateEpisodeIdByKey.set(key, episodeId);
    return episodeId;
  }

  const weightIncreaseEvaluation = evaluateWeightIncreaseTrend({
    now,
    points: weightPoints,
  });
  const weightIncreaseAlertId = weightIncreaseEvaluation.triggered
    ? getEpisodeIdForKey("weight_increase")
    : null;

  const weightDecreaseEvaluation = evaluateWeightDecreaseTrend({
    now,
    points: weightPoints,
  });
  const weightDecreaseAlertId = weightDecreaseEvaluation.triggered
    ? getEpisodeIdForKey("weight_decrease")
    : null;
  const bloodPressureEvaluation = evaluateBloodPressureUpTrend({
    now,
    points: bloodPressurePoints,
    systolicTargetValue: systolicTarget,
  });

  const bloodPressureAlertId = bloodPressureEvaluation.triggered
    ? getEpisodeIdForKey("blood_pressure_up")
    : null;
  const symptomsEvaluation = evaluateSymptomsWorsening({
    entries: symptomHistoryEntries,
    now,
  });
  const symptomsAlertId = symptomsEvaluation.triggered
    ? getEpisodeIdForKey("symptoms_worsening")
    : null;
  const existingStepsState = activeStatesByKey.get("steps_decline");
  const stepsStillBelowTarget =
    stepsEvaluation.targetValue !== null &&
    stepsEvaluation.currentAverage > 0 &&
    stepsEvaluation.currentAverage < stepsEvaluation.targetValue;
  const stepsStillBelowBaseline =
    stepsEvaluation.currentAverage > 0 && stepsEvaluation.declinePct >= 30;
  const stepsUnresolved =
    stepsEvaluation.triggered ||
    Boolean(
      existingStepsState && (stepsStillBelowTarget || stepsStillBelowBaseline),
    );
  const stepsAlertId = stepsUnresolved
    ? getEpisodeIdForKey("steps_decline")
    : null;

  const latestCheckInsByAlertId = await loadLatestWorseningTrendCheckIns(
    db,
    input.patientId,
    [
      stepsAlertId,
      weightIncreaseAlertId,
      weightDecreaseAlertId,
      bloodPressureAlertId,
      symptomsAlertId,
    ].filter((value): value is string => Boolean(value)),
  );
  const candidateAlerts: RawWorseningTrendAlert[] = [];

  if (stepsUnresolved && stepsAlertId) {
    const rule = WORSENING_TREND_RULES.steps_decline;
    const stepsFirstDetectedAt =
      activeStatesByKey.get("steps_decline")?.firstDetectedAt ?? now;
    const unresolvedDays =
      Math.floor(
        (startOfUtcDay(now).getTime() -
          startOfUtcDay(stepsFirstDetectedAt).getTime()) /
          (24 * 60 * 60 * 1000),
      ) + 1;
    candidateAlerts.push({
      body: "Your recent activity is below your normal baseline. Aim to move towards your daily target today.",
      checkInResponseCode: null,
      checkInResponseLabel: null,
      checkInSubmittedAt: null,
      detail: `7-day average ${Math.round(stepsEvaluation.currentAverage).toLocaleString()} steps vs previous 28-day average ${Math.round(stepsEvaluation.previousAverage).toLocaleString()} steps.`,
      detectedAt: new Date().toISOString(),
      key: "steps_decline",
      level:
        unresolvedDays >= 14 &&
        (stepsStillBelowTarget || stepsStillBelowBaseline)
          ? "level_3_escalate"
          : "level_1_nudge",
      portalEscalationEligible:
        unresolvedDays >= 14 &&
        (stepsStillBelowTarget || stepsStillBelowBaseline),
      repeatAtLocalTime: rule.appNotification?.repeatAtLocalTime ?? null,
      repeatUntil: rule.appNotification?.repeatUntil ?? null,
      screen: "/fitness-details",
      title: "Activity down",
    });
  }

  if (weightIncreaseEvaluation.triggered && weightIncreaseAlertId) {
    const checkIn = latestCheckInsByAlertId.get(weightIncreaseAlertId) ?? null;
    const responseCode = checkIn?.responseCode ?? null;
    const responseLabel = checkIn?.responseLabel ?? null;
    const hasConcerningResponse =
      responseCode !== null &&
      getConcerningWeightIncreaseResponses().has(responseCode);
    const hasExplainedResponse =
      responseCode !== null &&
      getExplainedWeightIncreaseResponses().has(responseCode);
    const portalEscalationEligible =
      weightIncreaseEvaluation.changeKg >= 4 || hasConcerningResponse;
    candidateAlerts.push({
      body: hasExplainedResponse
        ? "Thanks for checking in. Keep monitoring your weight, meals, salt intake, fluids, and care-plan tasks."
        : "Your weight is up this week. Review meals, salt, fluid intake, and your care-plan tasks.",
      checkInResponseCode: responseCode,
      checkInResponseLabel: responseLabel,
      checkInSubmittedAt: checkIn?.submittedAt?.toISOString() ?? null,
      detail: `${`Weight increased by ${weightIncreaseEvaluation.changeKg.toFixed(1)} kg over the last 7 days (${weightIncreaseEvaluation.previousWeightKg.toFixed(1)} kg to ${weightIncreaseEvaluation.currentWeightKg.toFixed(1)} kg).`}${responseLabel ? ` You reported: ${responseLabel}.` : ""}`,
      detectedAt: new Date().toISOString(),
      key: "weight_increase",
      level: portalEscalationEligible
        ? "level_3_escalate"
        : hasExplainedResponse
          ? "level_1_nudge"
          : "level_2_check_in",
      portalEscalationEligible,
      repeatAtLocalTime: null,
      repeatUntil: null,
      screen: buildCheckInScreenPath(weightIncreaseAlertId, "weight_increase"),
      title: "Weight up this week",
    });
  }

  if (weightDecreaseEvaluation.triggered && weightDecreaseAlertId) {
    const checkIn = latestCheckInsByAlertId.get(weightDecreaseAlertId) ?? null;
    const responseCode = checkIn?.responseCode ?? null;
    const responseLabel = checkIn?.responseLabel ?? null;
    const hasConcerningResponse =
      responseCode !== null &&
      getConcerningWeightDecreaseResponses().has(responseCode);
    const hasExplainedResponse = responseCode === "intentional_weight_loss";
    const portalEscalationEligible =
      weightDecreaseEvaluation.changeKg >= 4 || hasConcerningResponse;
    candidateAlerts.push({
      body: hasExplainedResponse
        ? "Thanks for checking in. Keep monitoring appetite, food intake, recent illness, and your care-plan tasks."
        : "Your weight is down this week. Review appetite, food intake, recent illness, and your care-plan tasks.",
      checkInResponseCode: responseCode,
      checkInResponseLabel: responseLabel,
      checkInSubmittedAt: checkIn?.submittedAt?.toISOString() ?? null,
      detail: `${`Weight decreased by ${weightDecreaseEvaluation.changeKg.toFixed(1)} kg over the last 7 days (${weightDecreaseEvaluation.previousWeightKg.toFixed(1)} kg to ${weightDecreaseEvaluation.currentWeightKg.toFixed(1)} kg).`}${responseLabel ? ` You reported: ${responseLabel}.` : ""}`,
      detectedAt: new Date().toISOString(),
      key: "weight_decrease",
      level: portalEscalationEligible
        ? "level_3_escalate"
        : hasExplainedResponse
          ? "level_1_nudge"
          : "level_2_check_in",
      portalEscalationEligible,
      repeatAtLocalTime: null,
      repeatUntil: null,
      screen: buildCheckInScreenPath(weightDecreaseAlertId, "weight_decrease"),
      title: "Weight down this week",
    });
  }

  if (bloodPressureEvaluation.triggered && bloodPressureAlertId) {
    const checkIn = latestCheckInsByAlertId.get(bloodPressureAlertId) ?? null;
    const responseCode = checkIn?.responseCode ?? null;
    const responseLabel = checkIn?.responseLabel ?? null;
    const hasConcerningResponse =
      responseCode !== null &&
      getConcerningBloodPressureResponses().has(responseCode);
    const hasExplainedResponse =
      responseCode !== null &&
      getExplainedBloodPressureResponses().has(responseCode);
    const portalEscalationEligible =
      hasConcerningResponse ||
      (bloodPressureEvaluation.deltaSystolic >= 20 &&
        (bloodPressureEvaluation.systolicAboveTargetBy ?? 0) > 0);
    candidateAlerts.push({
      body: "Your blood pressure trend is higher than usual. Review salt intake, medication, symptoms, and today's plan.",
      checkInResponseCode: responseCode,
      checkInResponseLabel: responseLabel,
      checkInSubmittedAt: checkIn?.submittedAt?.toISOString() ?? null,
      detail: `${`7-day average ${Math.round(bloodPressureEvaluation.currentAverageSystolic)}/${Math.round(bloodPressureEvaluation.currentAverageDiastolic)} mmHg vs previous 28-day average ${Math.round(bloodPressureEvaluation.previousAverageSystolic)}/${Math.round(bloodPressureEvaluation.previousAverageDiastolic)} mmHg.`}${responseLabel ? ` You reported: ${responseLabel}.` : ""}`,
      detectedAt: new Date().toISOString(),
      key: "blood_pressure_up",
      level: portalEscalationEligible
        ? "level_3_escalate"
        : hasExplainedResponse
          ? "level_1_nudge"
          : "level_2_check_in",
      portalEscalationEligible,
      repeatAtLocalTime: null,
      repeatUntil: null,
      screen: buildCheckInScreenPath(bloodPressureAlertId, "blood_pressure_up"),
      title: "Blood pressure up",
    });
  }

  if (symptomsEvaluation.triggered && symptomsAlertId) {
    const checkIn = latestCheckInsByAlertId.get(symptomsAlertId) ?? null;
    const responseCode = checkIn?.responseCode ?? null;
    const responseLabel = checkIn?.responseLabel ?? null;
    const persistedWorse = responseCode === "worse";
    const persistedImproving = responseCode === "improving";
    const portalEscalationEligible =
      persistedWorse ||
      (symptomsEvaluation.distinctSymptomDaysRecent >= 4 &&
        symptomsEvaluation.distinctSymptomDaysPrevious >= 4) ||
      symptomsEvaluation.severeRecentCount >= 3;
    candidateAlerts.push({
      body: "You have logged more symptoms this week. Review them and tell us whether they are improving, the same, or getting worse.",
      checkInResponseCode: responseCode,
      checkInResponseLabel: responseLabel,
      checkInSubmittedAt: checkIn?.submittedAt?.toISOString() ?? null,
      detail: `${
        symptomsEvaluation.repeatedSymptomName !== null
          ? `Repeated symptom this week: ${symptomsEvaluation.repeatedSymptomName}. Logged on ${symptomsEvaluation.distinctSymptomDaysRecent} days in the last 7 days.`
          : `Symptoms were logged on ${symptomsEvaluation.distinctSymptomDaysRecent} of the last 7 days.`
      }${responseLabel ? ` You reported: ${responseLabel}.` : ""}`,
      detectedAt: new Date().toISOString(),
      key: "symptoms_worsening",
      level: portalEscalationEligible
        ? "level_3_escalate"
        : persistedImproving
          ? "level_1_nudge"
          : "level_2_check_in",
      portalEscalationEligible,
      repeatAtLocalTime: null,
      repeatUntil: null,
      screen: buildCheckInScreenPath(symptomsAlertId, "symptoms_worsening"),
      title: "More symptoms reported",
    });
  }

  const nextStatesByKey = await syncWorseningTrendStates(
    db,
    input.patientId,
    candidateAlerts,
    activeStatesByKey,
    now,
  );

  return candidateAlerts
    .map((alert) => {
      const state = nextStatesByKey.get(alert.key);
      if (!state) {
        return null;
      }

      return buildAlert({
        ...alert,
        id: state.episodeId,
        detectedAt: now.toISOString(),
        firstDetectedAt: state.firstDetectedAt.toISOString(),
        lastDetectedAt: state.lastDetectedAt.toISOString(),
        viewedAt: state.viewedAt?.toISOString() ?? null,
      });
    })
    .filter((alert): alert is PatientWorseningTrendAlert => Boolean(alert));
}
