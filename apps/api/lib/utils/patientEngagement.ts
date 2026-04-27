import type { Db, ObjectId, WithId } from "mongodb";

import { COLLECTIONS } from "@ckd/core/server";

import { sendPatientPushNotification } from "./pushNotifications";
import { getMappedNutritionTargets } from "./targets";

type EngagementType =
  | "first_steps_threshold"
  | "exercise_days_streak"
  | "meal_logging_streak"
  | "meal_targets_streak"
  | "sleep_logging_streak"
  | "steps_multiplier_streak"
  | "steps_target_streak"
  | "weight_loss_weeks_streak";

type EngagementCopy = {
  body: string;
  title: string;
};

type EngagementDoc = {
  achievedAt: Date;
  createdAt: Date;
  createdBy: {
    actorType: "system";
    displayName: string;
    principalId: string;
  };
  delivery: {
    inApp: {
      firstShownAt: Date | null;
      openedAt: Date | null;
      status: "dismissed" | "expired" | "opened" | "pending" | "shown";
    };
    notification: {
      sentAt: Date | null;
      status: "failed" | "pending" | "sent" | "skipped";
    };
  };
  key: string;
  metadata?: Record<string, unknown>;
  orgId: string;
  patientId: ObjectId;
  sourceRefs: Array<Record<string, unknown>>;
  type: EngagementType;
};

type PendingEngagement = Pick<
  EngagementDoc,
  "achievedAt" | "key" | "metadata" | "type"
>;

type TargetStateLike = {
  effective?: TargetDefinitionLike;
  metric?: string;
  override?: TargetDefinitionLike;
  recommended?: TargetDefinitionLike;
} | null;

type TargetDefinitionLike = {
  basis?: "perDay" | "perKgPerDay" | null;
  high?: number | null;
  low?: number | null;
  type?: "exact" | "max" | "min" | "range";
  value?: number | null;
} | null;

type TargetsCurrentDoc = {
  patientId?: ObjectId | string;
  targets?: Record<string, TargetStateLike | number>;
};

type StepsMeasurementDoc = {
  _id: ObjectId;
  count?: number;
  measuredAt?: Date;
  patientId?: ObjectId;
};

type NutritionEntryDoc = {
  _id: ObjectId;
  eatenAt?: Date;
  patientId?: ObjectId;
  totals?: {
    phosphorusMg?: number;
    potassiumMg?: number;
    proteinG?: number;
    sodiumMg?: number;
  };
};

type MeasurementDoc = {
  _id: ObjectId;
  count?: number;
  kind?: string;
  measuredAt?: Date;
  source?: string;
  valueKg?: number;
};

const CREATED_BY = {
  actorType: "system" as const,
  displayName: "Engagement Engine",
  principalId: "engagement-engine",
};

const MEAL_STREAK_THRESHOLDS = [3, 5, 7] as const;
const STEP_STREAK_THRESHOLDS = [3, 5, 7] as const;
const STEP_MULTIPLIERS = [1.5, 2] as const;
const FIRST_STEPS_THRESHOLD = 10000;
const EXERCISE_STREAK_THRESHOLD = 7;
const WEIGHT_LOSS_WEEKS_THRESHOLD = 3;
const MEAL_TARGET_METRICS = [
  { key: "phosphorusMg", label: "phosphorus", unit: "mg/day" },
  { key: "proteinG", label: "protein", unit: "g/day" },
  { key: "sodiumMg", label: "sodium", unit: "mg/day" },
  { key: "potassiumMg", label: "potassium", unit: "mg/day" },
] as const;

function startOfUtcDay(date: Date) {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDayToken(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toWeekToken(date: Date) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / 604800000);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function startOfIsoWeek(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = start.getUTCDay() || 7;
  start.setUTCDate(start.getUTCDate() - day + 1);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

function resolveTargetValue(
  state: TargetStateLike | number | null | undefined,
): number | null {
  if (typeof state === "number" && Number.isFinite(state)) {
    return state;
  }
  if (!state || typeof state !== "object") {
    return null;
  }

  const target = state.effective ?? state.override ?? state.recommended ?? null;
  if (!target) return null;

  if (typeof target.value === "number" && Number.isFinite(target.value)) {
    return target.value;
  }
  if (target.type === "range") {
    return typeof target.high === "number"
      ? target.high
      : typeof target.low === "number"
        ? target.low
        : null;
  }
  if (target.type === "max") {
    return typeof target.high === "number"
      ? target.high
      : typeof target.value === "number"
        ? target.value
        : null;
  }
  if (target.type === "min") {
    return typeof target.low === "number"
      ? target.low
      : typeof target.value === "number"
        ? target.value
        : null;
  }
  return null;
}

async function resolveStepsTarget(
  db: Db,
  patientId: ObjectId,
): Promise<number | null> {
  const collection = db.collection<TargetsCurrentDoc>(COLLECTIONS.TargetsCurrent);
  const patientIdString = patientId.toString();

  const doc =
    (await collection.findOne(
      { patientId, targets: { $exists: true, $type: "object" } },
      { projection: { targets: 1 }, sort: { updatedAt: -1, _id: -1 } },
    )) ??
    (await collection.findOne(
      { patientId: patientIdString, targets: { $exists: true, $type: "object" } },
      { projection: { targets: 1 }, sort: { updatedAt: -1, _id: -1 } },
    ));

  const entries = Object.entries(doc?.targets ?? {});
  for (const [key, value] of entries) {
    if (key === "steps_per_day") {
      return resolveTargetValue(value);
    }
    if (value && typeof value === "object" && value.metric === "steps_per_day") {
      return resolveTargetValue(value);
    }
  }

  return null;
}

function consecutiveDayTokensEndingAt(
  endDate: Date,
  predicate: (token: string) => boolean,
  maxDays: number,
) {
  const tokens: string[] = [];
  for (let offset = 0; offset < maxDays; offset += 1) {
    const token = toDayToken(addUtcDays(endDate, -offset));
    if (!predicate(token)) break;
    tokens.unshift(token);
  }
  return tokens;
}

function consecutiveWeekTokensEndingAt(
  endDate: Date,
  predicate: (token: string) => boolean,
  maxWeeks: number,
) {
  const tokens: string[] = [];
  let cursor = startOfIsoWeek(endDate);
  for (let offset = 0; offset < maxWeeks; offset += 1) {
    const token = toWeekToken(cursor);
    if (!predicate(token)) break;
    tokens.unshift(token);
    cursor = addUtcDays(cursor, -7);
  }
  return tokens;
}

async function insertAchievement(
  db: Db,
  doc: EngagementDoc,
) {
  const result = await db.collection<EngagementDoc>(COLLECTIONS.PatientEngagementLedger).updateOne(
    { key: doc.key, patientId: doc.patientId },
    { $setOnInsert: doc },
    { upsert: true },
  );

  return result.upsertedCount > 0;
}

async function updateNotificationStatus(
  db: Db,
  patientId: ObjectId,
  key: string,
  status: EngagementDoc["delivery"]["notification"]["status"],
) {
  await db.collection(COLLECTIONS.PatientEngagementLedger).updateOne(
    { key, patientId },
    {
      $set: {
        "delivery.notification.sentAt": status === "sent" ? new Date() : null,
        "delivery.notification.status": status,
      },
    },
  );
}

async function deliverPatientEngagementNotification(
  db: Db,
  patientId: ObjectId,
  key: string,
  copy: EngagementCopy,
) {
  try {
    const result = await sendPatientPushNotification(db, {
      body: copy.body,
      data: {
        key,
        screen: "/(dashboard)/dashboard",
        type: "patient-engagement",
      },
      patientId: patientId.toString(),
      title: copy.title,
    });

    await updateNotificationStatus(
      db,
      patientId,
      key,
      result.attempted > 0 && result.delivered > 0 ? "sent" : "skipped",
    );
  } catch {
    await updateNotificationStatus(db, patientId, key, "failed");
  }
}

async function awardAchievement(
  db: Db,
  input: Omit<EngagementDoc, "createdAt" | "createdBy" | "delivery"> & {
    metadata?: Record<string, unknown>;
  },
) {
  const doc: EngagementDoc = {
    ...input,
    createdAt: new Date(),
    createdBy: CREATED_BY,
    delivery: {
      inApp: {
        firstShownAt: null,
        openedAt: null,
        status: "pending",
      },
      notification: {
        sentAt: null,
        status: "pending",
      },
    },
  };

  const inserted = await insertAchievement(db, doc);
  if (!inserted) {
    return false;
  }

  const copy = (doc.metadata?.copy ?? null) as EngagementCopy | null;
  if (copy?.title && copy?.body) {
    await deliverPatientEngagementNotification(db, doc.patientId, doc.key, copy);
  } else {
    await updateNotificationStatus(db, doc.patientId, doc.key, "skipped");
  }

  return true;
}

export async function awardMealLoggingEngagement(
  db: Db,
  input: {
    eatenAt: Date;
    orgId: string;
    patientId: ObjectId;
  },
) {
  const dayStart = startOfUtcDay(input.eatenAt);
  const rangeStart = addUtcDays(dayStart, -6);
  const rangeEnd = addUtcDays(dayStart, 1);
  const entries = await db
    .collection<NutritionEntryDoc>(COLLECTIONS.NutritionLedger)
    .find(
      {
        eatenAt: { $gte: rangeStart, $lt: rangeEnd },
        patientId: input.patientId,
      },
      { projection: { _id: 1, eatenAt: 1 } },
    )
    .toArray();

  const byDay = new Map<string, string[]>();
  for (const entry of entries) {
    if (!(entry.eatenAt instanceof Date)) continue;
    const token = toDayToken(entry.eatenAt);
    const current = byDay.get(token) ?? [];
    current.push(entry._id.toString());
    byDay.set(token, current);
  }

  const tokens = consecutiveDayTokensEndingAt(
    dayStart,
    (token) => byDay.has(token),
    7,
  );
  if (!tokens.length) return;

  for (const threshold of MEAL_STREAK_THRESHOLDS) {
    if (tokens.length < threshold) continue;

    const achievementDays = tokens.slice(-threshold);
    const endToken = achievementDays[achievementDays.length - 1];
    await awardAchievement(db, {
      achievedAt: input.eatenAt,
      key: `meal_logging_streak:${threshold}:${endToken}`,
      metadata: {
        copy: {
          body:
            threshold === 3
              ? "Meals logged three days in a row."
              : `Meals logged ${threshold} days in a row.`,
          title: `${threshold}-day meal streak`,
        },
        days: achievementDays,
        stats: { currentStreak: tokens.length },
        streakLength: threshold,
        window: {
          endDate: endToken,
          kind: "daily_streak",
          startDate: achievementDays[0],
          timezone: "UTC",
        },
      },
      orgId: input.orgId,
      patientId: input.patientId,
      sourceRefs: achievementDays.map((day) => ({
        collection: COLLECTIONS.NutritionLedger,
        kind: "meal",
        sourceDate: day,
      })),
      type: "meal_logging_streak",
    });
  }
}

export async function awardMealTargetsEngagement(
  db: Db,
  input: {
    eatenAt: Date;
    orgId: string;
    patientId: ObjectId;
  },
) {
  const targets = await getMappedNutritionTargets(db, input.patientId);
  if (!Object.keys(targets).length) {
    return;
  }

  const dayStart = startOfUtcDay(input.eatenAt);
  const rangeStart = addUtcDays(dayStart, -6);
  const rangeEnd = addUtcDays(dayStart, 1);
  const entries = await db
    .collection<NutritionEntryDoc>(COLLECTIONS.NutritionLedger)
    .find(
      {
        eatenAt: { $gte: rangeStart, $lt: rangeEnd },
        patientId: input.patientId,
      },
      { projection: { _id: 1, eatenAt: 1, totals: 1 } },
    )
    .toArray();

  const totalsByDay = new Map<
    string,
    { phosphorusMg: number; potassiumMg: number; proteinG: number; sodiumMg: number }
  >();

  for (const entry of entries) {
    if (!(entry.eatenAt instanceof Date)) continue;
    const token = toDayToken(entry.eatenAt);
    const current = totalsByDay.get(token) ?? {
      phosphorusMg: 0,
      potassiumMg: 0,
      proteinG: 0,
      sodiumMg: 0,
    };
    current.phosphorusMg += entry.totals?.phosphorusMg ?? 0;
    current.potassiumMg += entry.totals?.potassiumMg ?? 0;
    current.proteinG += entry.totals?.proteinG ?? 0;
    current.sodiumMg += entry.totals?.sodiumMg ?? 0;
    totalsByDay.set(token, current);
  }

  for (const metric of MEAL_TARGET_METRICS) {
    const targetValue = targets[metric.key];
    if (typeof targetValue !== "number" || targetValue <= 0) continue;

    const tokens = consecutiveDayTokensEndingAt(
      dayStart,
      (token) => {
        const totals = totalsByDay.get(token);
        if (!totals) return false;
        return (totals[metric.key] ?? Number.POSITIVE_INFINITY) <= targetValue;
      },
      7,
    );

    for (const threshold of MEAL_STREAK_THRESHOLDS) {
      if (tokens.length < threshold) continue;
      const achievementDays = tokens.slice(-threshold);
      const endToken = achievementDays[achievementDays.length - 1];

      await awardAchievement(db, {
        achievedAt: input.eatenAt,
        key: `meal_targets_streak:${metric.key},max,${threshold}:${endToken}`,
        metadata: {
          copy: {
            body: `Daily ${metric.label} stayed below target ${threshold} days in a row.`,
            title: `${threshold} days below ${metric.label} target`,
          },
          days: achievementDays,
          stats: {
            currentStreak: tokens.length,
            dailyTotals: achievementDays.map((day) => totalsByDay.get(day)?.[metric.key] ?? 0),
            target: targetValue,
          },
          streakLength: threshold,
          targetMetric: metric.key,
          targetValue,
          thresholdUnit: metric.unit,
          window: {
            endDate: endToken,
            kind: "daily_streak",
            startDate: achievementDays[0],
            timezone: "UTC",
          },
        },
        orgId: input.orgId,
        patientId: input.patientId,
        sourceRefs: [
          ...achievementDays.map((day) => ({
            collection: COLLECTIONS.NutritionLedger,
            kind: "meal",
            sourceDate: day,
          })),
          {
            collection: COLLECTIONS.TargetsCurrent,
            kind: "target",
          },
        ],
        type: "meal_targets_streak",
      });
    }
  }
}

export async function awardStepsEngagement(
  db: Db,
  input: {
    count: number;
    measuredAt: Date;
    orgId: string;
    patientId: ObjectId;
  },
) {
  const dayStart = startOfUtcDay(input.measuredAt);
  const rangeStart = addUtcDays(dayStart, -6);
  const rangeEnd = addUtcDays(dayStart, 1);
  const measurements = await db
    .collection<StepsMeasurementDoc>(COLLECTIONS.MeasurementsLedger)
    .find(
      {
        kind: "steps",
        measuredAt: { $gte: rangeStart, $lt: rangeEnd },
        patientId: input.patientId,
      },
      { projection: { _id: 1, count: 1, measuredAt: 1 } },
    )
    .toArray();

  const dailyCounts = new Map<string, number>();
  for (const measurement of measurements) {
    if (!(measurement.measuredAt instanceof Date)) continue;
    const token = toDayToken(measurement.measuredAt);
    const count = typeof measurement.count === "number" ? measurement.count : 0;
    dailyCounts.set(token, Math.max(count, dailyCounts.get(token) ?? 0));
  }

  const endToken = toDayToken(dayStart);
  const currentCount = dailyCounts.get(endToken) ?? input.count;

  if (currentCount >= FIRST_STEPS_THRESHOLD) {
    await awardAchievement(db, {
      achievedAt: input.measuredAt,
      key: `first_steps_threshold:${FIRST_STEPS_THRESHOLD}`,
      metadata: {
        copy: {
          body: `You reached ${FIRST_STEPS_THRESHOLD.toLocaleString()} steps in a day.`,
          title: "Big step day",
        },
        stats: { dayCount: currentCount },
        threshold: FIRST_STEPS_THRESHOLD,
        thresholdUnit: "steps/day",
      },
      orgId: input.orgId,
      patientId: input.patientId,
      sourceRefs: [
        {
          collection: COLLECTIONS.MeasurementsLedger,
          kind: "steps",
          sourceDate: endToken,
        },
      ],
      type: "first_steps_threshold",
    });
  }

  const targetValue = await resolveStepsTarget(db, input.patientId);
  if (!targetValue || targetValue <= 0) {
    return;
  }

  const targetTokens = consecutiveDayTokensEndingAt(
    dayStart,
    (token) => (dailyCounts.get(token) ?? 0) >= targetValue,
    7,
  );

  for (const threshold of STEP_STREAK_THRESHOLDS) {
    if (targetTokens.length < threshold) continue;
    const streakDays = targetTokens.slice(-threshold);
    await awardAchievement(db, {
      achievedAt: input.measuredAt,
      key: `steps_target_streak:${threshold}:${endToken}`,
      metadata: {
        copy: {
          body: `You hit your daily step target ${threshold} days in a row.`,
          title: `${threshold}-day step streak`,
        },
        days: streakDays,
        stats: {
          currentStreak: targetTokens.length,
          dailyCounts: streakDays.map((day) => dailyCounts.get(day) ?? 0),
          target: targetValue,
        },
        streakLength: threshold,
        targetMetric: "steps",
        targetValue,
        window: {
          endDate: streakDays[streakDays.length - 1],
          kind: "daily_streak",
          startDate: streakDays[0],
          timezone: "UTC",
        },
      },
      orgId: input.orgId,
      patientId: input.patientId,
      sourceRefs: streakDays.map((day) => ({
        collection: COLLECTIONS.MeasurementsLedger,
        kind: "steps",
        sourceDate: day,
      })),
      type: "steps_target_streak",
    });
  }

  for (const multiplier of STEP_MULTIPLIERS) {
    const multipliedTarget = Math.ceil(targetValue * multiplier);
    const multiplierTokens = consecutiveDayTokensEndingAt(
      dayStart,
      (token) => (dailyCounts.get(token) ?? 0) >= multipliedTarget,
      7,
    );
    if (multiplierTokens.length < 3) continue;

    const streakDays = multiplierTokens.slice(-3);
    await awardAchievement(db, {
      achievedAt: input.measuredAt,
      key: `steps_multiplier_streak:${multiplier}x:3:${endToken}`,
      metadata: {
        copy: {
          body: `You hit ${multiplier}x your steps target for three straight days.`,
          title: `${multiplier}x steps streak`,
        },
        days: streakDays,
        stats: {
          dailyCounts: streakDays.map((day) => dailyCounts.get(day) ?? 0),
          multiplier,
          target: targetValue,
        },
        streakLength: 3,
        targetMetric: "steps",
        targetValue,
        threshold: multipliedTarget,
        thresholdUnit: "steps/day",
        window: {
          endDate: streakDays[streakDays.length - 1],
          kind: "daily_streak",
          startDate: streakDays[0],
          timezone: "UTC",
        },
      },
      orgId: input.orgId,
      patientId: input.patientId,
      sourceRefs: streakDays.map((day) => ({
        collection: COLLECTIONS.MeasurementsLedger,
        kind: "steps",
        sourceDate: day,
      })),
      type: "steps_multiplier_streak",
    });
  }
}

export async function awardSleepLoggingEngagement(
  db: Db,
  input: {
    measuredAt: Date;
    orgId: string;
    patientId: ObjectId;
    source: string;
  },
) {
  if (input.source !== "patient") return;

  const dayStart = startOfUtcDay(input.measuredAt);
  const rangeStart = addUtcDays(dayStart, -6);
  const rangeEnd = addUtcDays(dayStart, 1);
  const measurements = await db
    .collection<MeasurementDoc>(COLLECTIONS.MeasurementsLedger)
    .find(
      {
        kind: "sleep",
        measuredAt: { $gte: rangeStart, $lt: rangeEnd },
        patientId: input.patientId,
        source: "patient",
      },
      { projection: { _id: 1, measuredAt: 1 } },
    )
    .toArray();

  const byDay = new Set<string>();
  for (const measurement of measurements) {
    if (!(measurement.measuredAt instanceof Date)) continue;
    byDay.add(toDayToken(measurement.measuredAt));
  }

  const tokens = consecutiveDayTokensEndingAt(dayStart, (token) => byDay.has(token), 7);
  for (const threshold of MEAL_STREAK_THRESHOLDS) {
    if (tokens.length < threshold) continue;
    const streakDays = tokens.slice(-threshold);
    const endToken = streakDays[streakDays.length - 1];

    await awardAchievement(db, {
      achievedAt: input.measuredAt,
      key: `sleep_logging_streak:manual:${threshold}:${endToken}`,
      metadata: {
        copy: {
          body: `Manual sleep logged ${threshold} days in a row.`,
          title: `${threshold}-day sleep streak`,
        },
        days: streakDays,
        stats: { currentStreak: tokens.length },
        streakLength: threshold,
        window: {
          endDate: endToken,
          kind: "daily_streak",
          startDate: streakDays[0],
          timezone: "UTC",
        },
      },
      orgId: input.orgId,
      patientId: input.patientId,
      sourceRefs: streakDays.map((day) => ({
        collection: COLLECTIONS.MeasurementsLedger,
        kind: "sleep",
        sourceDate: day,
      })),
      type: "sleep_logging_streak",
    });
  }
}

export async function awardExerciseDaysEngagement(
  db: Db,
  input: {
    measuredAt: Date;
    orgId: string;
    patientId: ObjectId;
  },
) {
  const dayStart = startOfUtcDay(input.measuredAt);
  const rangeStart = addUtcDays(dayStart, -(EXERCISE_STREAK_THRESHOLD - 1));
  const rangeEnd = addUtcDays(dayStart, 1);
  const measurements = await db
    .collection<MeasurementDoc>(COLLECTIONS.MeasurementsLedger)
    .find(
      {
        kind: "exercise",
        measuredAt: { $gte: rangeStart, $lt: rangeEnd },
        patientId: input.patientId,
      },
      { projection: { _id: 1, measuredAt: 1 } },
    )
    .toArray();

  const byDay = new Set<string>();
  for (const measurement of measurements) {
    if (!(measurement.measuredAt instanceof Date)) continue;
    byDay.add(toDayToken(measurement.measuredAt));
  }

  const tokens = consecutiveDayTokensEndingAt(
    dayStart,
    (token) => byDay.has(token),
    EXERCISE_STREAK_THRESHOLD,
  );
  if (tokens.length < EXERCISE_STREAK_THRESHOLD) return;

  const endToken = tokens[tokens.length - 1];
  await awardAchievement(db, {
    achievedAt: input.measuredAt,
    key: `exercise_days_streak:${EXERCISE_STREAK_THRESHOLD}:${endToken}`,
    metadata: {
      copy: {
        body: "Seven straight days of exercise. You're a beast!!",
        title: "You're a beast!!",
      },
      days: tokens.slice(-EXERCISE_STREAK_THRESHOLD),
      stats: { currentStreak: tokens.length },
      streakLength: EXERCISE_STREAK_THRESHOLD,
      window: {
        endDate: endToken,
        kind: "daily_streak",
        startDate: tokens[0],
        timezone: "UTC",
      },
    },
    orgId: input.orgId,
    patientId: input.patientId,
    sourceRefs: tokens.slice(-EXERCISE_STREAK_THRESHOLD).map((day) => ({
      collection: COLLECTIONS.MeasurementsLedger,
      kind: "exercise",
      sourceDate: day,
    })),
    type: "exercise_days_streak",
  });
}

export async function awardWeightLossWeeksEngagement(
  db: Db,
  input: {
    measuredAt: Date;
    orgId: string;
    patientId: ObjectId;
  },
) {
  const weekStart = startOfIsoWeek(input.measuredAt);
  const rangeStart = addUtcDays(weekStart, -28);
  const rangeEnd = addUtcDays(weekStart, 7);
  const measurements = await db
    .collection<MeasurementDoc>(COLLECTIONS.MeasurementsLedger)
    .find(
      {
        kind: "weight",
        measuredAt: { $gte: rangeStart, $lt: rangeEnd },
        patientId: input.patientId,
      },
      { projection: { _id: 1, measuredAt: 1, valueKg: 1 } },
    )
    .sort({ measuredAt: 1, _id: 1 })
    .toArray();

  const weeklyLatest = new Map<string, { measuredAt: Date; valueKg: number }>();
  for (const measurement of measurements) {
    if (!(measurement.measuredAt instanceof Date)) continue;
    if (typeof measurement.valueKg !== "number" || measurement.valueKg <= 0) continue;
    const token = toWeekToken(measurement.measuredAt);
    const existing = weeklyLatest.get(token);
    if (!existing || measurement.measuredAt >= existing.measuredAt) {
      weeklyLatest.set(token, {
        measuredAt: measurement.measuredAt,
        valueKg: measurement.valueKg,
      });
    }
  }

  const weekTokens = consecutiveWeekTokensEndingAt(
    input.measuredAt,
    (token) => weeklyLatest.has(token),
    WEIGHT_LOSS_WEEKS_THRESHOLD,
  );
  if (weekTokens.length < WEIGHT_LOSS_WEEKS_THRESHOLD) return;

  const values = weekTokens.map((token) => weeklyLatest.get(token)?.valueKg ?? Number.NaN);
  const isLosingEachWeek = values.every((value, index) => {
    if (index === 0) return Number.isFinite(value);
    return Number.isFinite(value) && value < values[index - 1];
  });
  if (!isLosingEachWeek) return;

  const endToken = weekTokens[weekTokens.length - 1];
  await awardAchievement(db, {
    achievedAt: input.measuredAt,
    key: `weight_loss_weeks_streak:${WEIGHT_LOSS_WEEKS_THRESHOLD}:${endToken}`,
    metadata: {
      copy: {
        body: "Weight trended down three weeks in a row.",
        title: "3-week weight loss streak",
      },
      stats: {
        weeklyWeightsKg: values,
      },
      streakLength: WEIGHT_LOSS_WEEKS_THRESHOLD,
      weeks: weekTokens,
      window: {
        endWeek: endToken,
        kind: "weekly_trend",
        startWeek: weekTokens[0],
        timezone: "UTC",
      },
    },
    orgId: input.orgId,
    patientId: input.patientId,
    sourceRefs: weekTokens.map((week) => ({
      collection: COLLECTIONS.MeasurementsLedger,
      kind: "weight",
      weekStart: week,
    })),
    type: "weight_loss_weeks_streak",
  });
}

export async function getPendingPatientEngagement(
  db: Db,
  patientId: ObjectId,
) {
  const doc = await db
    .collection<PendingEngagement>(COLLECTIONS.PatientEngagementLedger)
    .findOne(
      {
        patientId,
        "delivery.inApp.status": { $in: ["pending", "shown"] },
      },
      {
        projection: {
          achievedAt: 1,
          key: 1,
          metadata: 1,
          type: 1,
        },
        sort: { achievedAt: -1, _id: -1 },
      },
    );

  return doc ?? null;
}

export async function markPatientEngagementOpened(
  db: Db,
  patientId: ObjectId,
  key: string,
) {
  const now = new Date();
  const result = await db.collection(COLLECTIONS.PatientEngagementLedger).updateOne(
    {
      key,
      patientId,
      "delivery.inApp.status": { $in: ["pending", "shown"] },
    },
    {
      $set: {
        "delivery.inApp.firstShownAt": now,
        "delivery.inApp.openedAt": now,
        "delivery.inApp.status": "opened",
      },
    },
  );

  return result.modifiedCount > 0;
}

export function serializePendingPatientEngagement(
  doc: WithId<PendingEngagement> | PendingEngagement | null,
) {
  if (!doc) return null;

  return {
    achievedAt: doc.achievedAt.toISOString(),
    key: doc.key,
    metadata: doc.metadata ?? null,
    type: doc.type,
  };
}
