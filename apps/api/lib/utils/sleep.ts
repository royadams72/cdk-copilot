import { COLLECTIONS } from "@ckd/core/server";
import type { Db, ObjectId } from "mongodb";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SLEEP_TARGET_MIN = 8 * 60;
export const DEFAULT_SLEEP_REMINDER_HOUR = 8;

type SleepSource = "patient" | "device" | "api" | "provider";

export type SleepMeasurementDoc = {
  createdAt?: Date;
  device?: Record<string, unknown>;
  durationMin?: number;
  externalRecordId?: string;
  kind: "sleep";
  measuredAt: Date;
  patientId: ObjectId;
  provider?: Record<string, unknown>;
  receivedAt?: Date;
  sleepFromAt?: Date;
  sleepToAt?: Date;
  source?: SleepSource;
  updatedAt?: Date;
};

type UserPiiDoc = {
  notificationPrefs?: {
    push?: boolean;
  };
  patientId?: ObjectId | string;
  timeZone?: string;
};

type SleepDayAggregate = {
  date: string;
  durationMin: number;
  measuredAt: Date;
  segments: number;
  sleepFromAt?: Date;
  sleepToAt?: Date;
};

export type WeeklySleepSummary = {
  advice: string[];
  averageLoggedDurationMin: number | null;
  hasEnoughSleep: boolean;
  humanMessage: string;
  loggedDays: number;
  manualLoggingOnly: boolean;
  nightsBelowTarget: number;
  splitNights: number;
  targetDurationMin: number;
  weekEnd: string;
  weeklyAverageDurationMin: number;
  weekStart: string;
};

export type SleepReminderStatus = {
  enabled: boolean;
  hasProviderSleepData: boolean;
  reminderHour: number;
  usesManualSleepLogging: boolean;
};

function getFormatter(timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    });
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "Europe/London",
      year: "numeric",
    });
  }
}

export function formatDayKey(date: Date, timeZone: string) {
  const parts = getFormatter(timeZone).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function getDurationMin(doc: SleepMeasurementDoc) {
  if (typeof doc.durationMin === "number" && Number.isFinite(doc.durationMin)) {
    return Math.max(0, Math.round(doc.durationMin));
  }
  if (doc.sleepFromAt && doc.sleepToAt) {
    return Math.max(
      0,
      Math.round((doc.sleepToAt.getTime() - doc.sleepFromAt.getTime()) / 60000),
    );
  }
  return 0;
}

export async function getPatientTimeZone(db: Db, patientId: ObjectId) {
  const pii = await db.collection<UserPiiDoc>(COLLECTIONS.UsersPII).findOne(
    { patientId },
    { projection: { _id: 0, timeZone: 1 } },
  );
  return pii?.timeZone?.trim() || "Europe/London";
}

export function aggregateSleepDocsByDay(
  docs: SleepMeasurementDoc[],
  timeZone: string,
) {
  const byDay = new Map<string, SleepDayAggregate>();

  for (const doc of docs) {
    const measuredAt = doc.sleepToAt ?? doc.measuredAt;
    const key = formatDayKey(measuredAt, timeZone);
    const durationMin = getDurationMin(doc);
    const current = byDay.get(key);

    if (!current) {
      byDay.set(key, {
        date: key,
        durationMin,
        measuredAt,
        segments: 1,
        sleepFromAt: doc.sleepFromAt,
        sleepToAt: doc.sleepToAt ?? measuredAt,
      });
      continue;
    }

    current.durationMin += durationMin;
    current.segments += 1;
    if (measuredAt.getTime() > current.measuredAt.getTime()) {
      current.measuredAt = measuredAt;
    }
    if (
      doc.sleepFromAt &&
      (!current.sleepFromAt ||
        doc.sleepFromAt.getTime() < current.sleepFromAt.getTime())
    ) {
      current.sleepFromAt = doc.sleepFromAt;
    }
    const sleepToAt = doc.sleepToAt ?? measuredAt;
    if (
      !current.sleepToAt ||
      sleepToAt.getTime() > current.sleepToAt.getTime()
    ) {
      current.sleepToAt = sleepToAt;
    }
  }

  return byDay;
}

export async function getLatestAggregatedSleepMeasurement(
  db: Db,
  patientId: ObjectId,
) {
  const timeZone = await getPatientTimeZone(db, patientId);
  const docs = await db
    .collection<SleepMeasurementDoc>(COLLECTIONS.MeasurementsLedger)
    .find(
      { kind: "sleep", patientId },
      { projection: { _id: 0 }, sort: { measuredAt: -1, receivedAt: -1 } },
    )
    .limit(50)
    .toArray();

  if (!docs.length) {
    return null;
  }

  const latest = docs[0];
  const latestKey = formatDayKey(latest.sleepToAt ?? latest.measuredAt, timeZone);
  const sameDayDocs = docs.filter(
    (doc) =>
      formatDayKey(doc.sleepToAt ?? doc.measuredAt, timeZone) === latestKey,
  );
  const aggregate = aggregateSleepDocsByDay(sameDayDocs, timeZone).get(latestKey);
  if (!aggregate) {
    return latest;
  }

  return {
    ...latest,
    durationMin: aggregate.durationMin,
    measuredAt: aggregate.measuredAt,
    sleepFromAt: aggregate.sleepFromAt ?? latest.sleepFromAt,
    sleepToAt: aggregate.sleepToAt ?? latest.sleepToAt,
    sleepSegments: aggregate.segments,
  };
}

function listRecentDayKeys(referenceDate: Date, timeZone: string, days: number) {
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(referenceDate.getTime() - offset * DAY_MS);
    keys.push(formatDayKey(date, timeZone));
  }
  return keys;
}

function buildSleepAdvice(input: {
  loggedDays: number;
  manualLoggingOnly: boolean;
  nightsBelowTarget: number;
  splitNights: number;
  weeklyAverageDurationMin: number;
}) {
  const advice: string[] = [];

  if (input.loggedDays === 0) {
    return [
      "Log your sleep each morning so the app can spot patterns across the week.",
      "Aim for a consistent lights-out and wake-up time, even on weekends.",
    ];
  }

  if (input.weeklyAverageDurationMin < 6 * 60) {
    advice.push(
      "Protect a longer sleep window by moving bedtime 30 to 60 minutes earlier for the next week.",
    );
  } else if (input.weeklyAverageDurationMin < SLEEP_TARGET_MIN) {
    advice.push(
      "A small extension usually helps here. Try adding 15 to 30 minutes to your sleep window each night.",
    );
  }

  if (input.nightsBelowTarget >= 3) {
    advice.push(
      "Keep your wake-up time steady and reduce late caffeine, heavy meals, and screen time in the last hour before bed.",
    );
  }

  if (input.splitNights >= 2) {
    advice.push(
      "Your sleep was split on multiple nights. A calmer pre-bed routine and limiting overnight disruptions may help consolidate it.",
    );
  }

  if (input.manualLoggingOnly) {
    advice.push(
      "Because sleep is being logged manually, record it in the morning so the weekly summary stays complete.",
    );
  }

  if (!advice.length) {
    advice.push(
      "Keep the same sleep schedule this week. Consistency is the main thing to protect when you are already near target.",
    );
  }

  return advice.slice(0, 3);
}

function buildHumanMessage(input: {
  averageLoggedDurationMin: number | null;
  hasEnoughSleep: boolean;
  loggedDays: number;
  nightsBelowTarget: number;
  weeklyAverageDurationMin: number;
}) {
  if (input.loggedDays === 0) {
    return "No sleep was logged in the last 7 days, so there is not enough data to judge your weekly sleep yet.";
  }

  const weeklyHours = (input.weeklyAverageDurationMin / 60).toFixed(1);
  const loggedHours =
    input.averageLoggedDurationMin !== null
      ? (input.averageLoggedDurationMin / 60).toFixed(1)
      : null;

  if (input.hasEnoughSleep) {
    return `You averaged ${weeklyHours} hours of sleep across the week and were close to target on most nights.`;
  }

  if (loggedHours) {
    return `You averaged ${loggedHours} hours on logged nights (${weeklyHours} hours across the full week), with ${input.nightsBelowTarget} nights below the 8 hour target.`;
  }

  return `You averaged ${weeklyHours} hours of sleep across the week, which is below the 8 hour target.`;
}

export async function getWeeklySleepSummary(
  db: Db,
  patientId: ObjectId,
  options?: { referenceDate?: Date },
) {
  const referenceDate = options?.referenceDate ?? new Date();
  const timeZone = await getPatientTimeZone(db, patientId);
  const weekKeys = listRecentDayKeys(referenceDate, timeZone, 7);
  const weekStart = weekKeys[0];
  const weekEnd = weekKeys[weekKeys.length - 1];
  const startDate = new Date(referenceDate.getTime() - 8 * DAY_MS);

  const docs = await db
    .collection<SleepMeasurementDoc>(COLLECTIONS.MeasurementsLedger)
    .find(
      {
        kind: "sleep",
        measuredAt: { $gte: startDate },
        patientId,
      },
      {
        projection: {
          _id: 0,
          durationMin: 1,
          kind: 1,
          measuredAt: 1,
          patientId: 1,
          sleepFromAt: 1,
          sleepToAt: 1,
          source: 1,
        },
        sort: { measuredAt: -1 },
      },
    )
    .toArray();

  const byDay = aggregateSleepDocsByDay(docs, timeZone);
  const weekAggregates = weekKeys
    .map((key) => byDay.get(key))
    .filter((value): value is SleepDayAggregate => Boolean(value));
  const totalDurationMin = weekAggregates.reduce(
    (sum, item) => sum + item.durationMin,
    0,
  );
  const loggedDays = weekAggregates.length;
  const weeklyAverageDurationMin = Math.round(totalDurationMin / 7);
  const averageLoggedDurationMin = loggedDays
    ? Math.round(totalDurationMin / loggedDays)
    : null;
  const nightsBelowTarget = weekAggregates.filter(
    (item) => item.durationMin < SLEEP_TARGET_MIN,
  ).length;
  const splitNights = weekAggregates.filter((item) => item.segments > 1).length;
  const manualLoggingOnly = docs.every((doc) => doc.source !== "provider");
  const hasEnoughSleep = weeklyAverageDurationMin >= SLEEP_TARGET_MIN;
  const advice = buildSleepAdvice({
    loggedDays,
    manualLoggingOnly,
    nightsBelowTarget,
    splitNights,
    weeklyAverageDurationMin,
  });

  return {
    advice,
    averageLoggedDurationMin,
    hasEnoughSleep,
    humanMessage: buildHumanMessage({
      averageLoggedDurationMin,
      hasEnoughSleep,
      loggedDays,
      nightsBelowTarget,
      weeklyAverageDurationMin,
    }),
    loggedDays,
    manualLoggingOnly,
    nightsBelowTarget,
    splitNights,
    targetDurationMin: SLEEP_TARGET_MIN,
    weekEnd,
    weekStart,
    weeklyAverageDurationMin,
  } satisfies WeeklySleepSummary;
}

export async function getSleepReminderStatus(db: Db, patientId: ObjectId) {
  const usersPii = db.collection<UserPiiDoc>(COLLECTIONS.UsersPII);
  const [pii, providerSleepDoc] = await Promise.all([
    usersPii.findOne(
      { patientId },
      { projection: { _id: 0, notificationPrefs: 1 } },
    ),
    db.collection<SleepMeasurementDoc>(COLLECTIONS.MeasurementsLedger).findOne(
      {
        kind: "sleep",
        patientId,
        source: "provider",
      },
      { projection: { _id: 0, kind: 1 } },
    ),
  ]);

  const hasProviderSleepData = Boolean(providerSleepDoc);
  const usesManualSleepLogging = !hasProviderSleepData;
  const pushEnabled = pii?.notificationPrefs?.push !== false;

  return {
    enabled: pushEnabled && usesManualSleepLogging,
    hasProviderSleepData,
    reminderHour: DEFAULT_SLEEP_REMINDER_HOUR,
    usesManualSleepLogging,
  } satisfies SleepReminderStatus;
}
