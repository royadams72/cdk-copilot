import { COLLECTIONS } from "@ckd/core/server";
import type { Db, ObjectId } from "mongodb";

const DAY_MS = 24 * 60 * 60 * 1000;
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
  averageLoggedDurationMin: number | null;
  loggedDays: number;
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
  return {
    averageLoggedDurationMin,
    loggedDays,
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
