import {
  readNativeHealthKitAnchoredBloodPressureChanges,
  readNativeHealthKitAnchoredExerciseChanges,
  consumeNativeHealthKitPendingObserverTypes,
  getNativeHealthKitStatus,
  readNativeHealthKitAnchoredHeartRateChanges,
  readNativeHealthKitAnchoredSleepChanges,
  readNativeHealthKitBloodPressureEntriesForDate,
  readNativeHealthKitExerciseEntriesForDate,
  readNativeHealthKitHourlyStepCountsForDate,
  readNativeHealthKitHeartRateEntriesForDate,
  readNativeHealthKitSleepEntriesForDate,
  readNativeHealthKitStepSummaryForDate,
} from "@/lib/healthKitNativeBridge";
import { healthKitRuntimeState } from "@/lib/healthKitSyncState";
import { logHealthConnectEvent } from "@/lib/healthConnectEventLogger";
import {
  createMeasurementDirect,
  localDateKey,
  measurementsBatchUpsert,
  representativeHeartRatePayload,
} from "@/lib/healthConnectSyncPipeline";
import {
  type BackfillableMeasurementKind,
  getServerHealthConnectSyncState,
  invalidateMeasurementCaches,
  measurementSyncEventSource,
  MIN_BACKGROUND_SYNC_INTERVAL_MS,
  stepSyncEventSource,
  updateServerHealthConnectSyncState,
} from "@/lib/healthConnectSyncCommon";
import type { CreateMeasurementArgs } from "@/store/services/types";

const HEALTHKIT_PROVIDER = {
  displayName: "Apple Health",
  packageName: "apple.healthkit",
} as const;

function buildHealthKitStepSyncMeta(
  dayKey: string,
): Extract<CreateMeasurementArgs, { kind: "steps" }>["sync"] {
  const reconciledAt = new Date().toISOString();
  return {
    dayKey,
    finalizedAt: reconciledAt,
    lastReconciledAt: reconciledAt,
    provider: "healthkit",
    status: "finalized",
  };
}

function stepSyncSlotKey(date: Date) {
  const dateKey = localDateKey(date);
  const slot = Math.floor(date.getTime() / MIN_BACKGROUND_SYNC_INTERVAL_MS);
  return `${dateKey}:${slot}`;
}

function dateForDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function toDayMeasuredAt(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
    0,
    0,
    0,
  ).toISOString();
}

function inFlightBackfillKey(
  kind: Exclude<BackfillableMeasurementKind, "steps"> | "steps",
  windowKey: string,
) {
  return kind === "steps" ? windowKey : `${kind}:${windowKey}`;
}

function recordLatestSyncedAt(
  payloads: CreateMeasurementArgs[],
  kind: "blood_pressure" | "exercise" | "heart_rate" | "sleep" | "steps",
) {
  const latestMeasuredAt = payloads
    .map((payload) => payload.measuredAt)
    .filter((value): value is string => typeof value === "string")
    .sort((a, b) => b.localeCompare(a))[0];

  if (!latestMeasuredAt) {
    return null;
  }

  switch (kind) {
    case "steps":
      return { steps: { lastSyncedAt: latestMeasuredAt } };
    case "heart_rate":
      return { heart_rate: { lastSyncedAt: latestMeasuredAt } };
    case "blood_pressure":
      return { blood_pressure: { lastSyncedAt: latestMeasuredAt } };
    case "sleep":
      return { sleep: { lastSyncedAt: latestMeasuredAt } };
    default:
      return { exercise: { lastSyncedAt: latestMeasuredAt } };
  }
}

export async function readHealthKitHourlyStepsForDate(date: Date) {
  return readNativeHealthKitHourlyStepCountsForDate(date);
}

function toHealthKitHeartRatePayloads(
  entries: Awaited<ReturnType<typeof readNativeHealthKitHeartRateEntriesForDate>>,
) {
  return entries.flatMap((entry) => {
    if (typeof entry.value !== "number" || !Number.isFinite(entry.value)) {
      return [];
    }

    return [
      {
        bpm: Math.round(entry.value),
        externalRecordId: `healthkit:apple.healthkit:heart_rate:${entry.measuredAt}`,
        kind: "heart_rate",
        measuredAt: entry.measuredAt,
        provider: HEALTHKIT_PROVIDER,
        source: "provider",
      } satisfies Extract<CreateMeasurementArgs, { kind: "heart_rate" }>,
    ];
  });
}

function toHealthKitBloodPressurePayloads(
  entries: Awaited<ReturnType<typeof readNativeHealthKitBloodPressureEntriesForDate>>,
) {
  return entries
    .filter(
      (
        entry,
      ): entry is {
        diastolicMmHg: number;
        externalRecordId: string;
        measuredAt: string;
        systolicMmHg: number;
      } =>
        typeof entry.externalRecordId === "string" &&
        typeof entry.measuredAt === "string" &&
        typeof entry.systolicMmHg === "number" &&
        Number.isFinite(entry.systolicMmHg) &&
        typeof entry.diastolicMmHg === "number" &&
        Number.isFinite(entry.diastolicMmHg),
    )
    .map(
      (entry): Extract<CreateMeasurementArgs, { kind: "blood_pressure" }> => ({
        diastolicMmHg: Math.round(entry.diastolicMmHg),
        externalRecordId: entry.externalRecordId,
        kind: "blood_pressure",
        measuredAt: entry.measuredAt,
        provider: HEALTHKIT_PROVIDER,
        source: "provider",
        systolicMmHg: Math.round(entry.systolicMmHg),
      }),
    );
}

function toHealthKitSleepPayloads(
  entries: Awaited<ReturnType<typeof readNativeHealthKitSleepEntriesForDate>>,
) {
  return entries
    .filter(
      (
        entry,
      ): entry is {
        durationMin: number;
        externalRecordId: string;
        measuredAt: string;
        sleepFromAt: string;
        sleepToAt: string;
      } =>
        typeof entry.externalRecordId === "string" &&
        typeof entry.measuredAt === "string" &&
        typeof entry.sleepFromAt === "string" &&
        typeof entry.sleepToAt === "string" &&
        typeof entry.durationMin === "number" &&
        Number.isFinite(entry.durationMin),
    )
    .map(
      (entry): Extract<CreateMeasurementArgs, { kind: "sleep" }> => ({
        durationMin: Math.max(0, Math.round(entry.durationMin)),
        externalRecordId: entry.externalRecordId,
        kind: "sleep",
        measuredAt: entry.measuredAt,
        provider: HEALTHKIT_PROVIDER,
        sleepFromAt: entry.sleepFromAt,
        sleepToAt: entry.sleepToAt,
        source: "provider",
      }),
    );
}

function toHealthKitExercisePayloads(
  entries: Awaited<ReturnType<typeof readNativeHealthKitExerciseEntriesForDate>>,
) {
  return entries
    .filter(
      (
        entry,
      ): entry is {
        caloriesKcal: number | null;
        durationMin: number;
        exerciseId: string;
        exerciseTitle: string;
        externalRecordId: string;
        measuredAt: string;
      } =>
        typeof entry.externalRecordId === "string" &&
        typeof entry.measuredAt === "string" &&
        typeof entry.exerciseId === "string" &&
        typeof entry.exerciseTitle === "string" &&
        typeof entry.durationMin === "number" &&
        Number.isFinite(entry.durationMin),
    )
    .map(
      (entry): Extract<CreateMeasurementArgs, { kind: "exercise" }> => ({
        caloriesKcal:
          typeof entry.caloriesKcal === "number" && Number.isFinite(entry.caloriesKcal)
            ? Math.max(0, Math.round(entry.caloriesKcal))
            : undefined,
        category: "healthkit",
        durationMin: Math.max(0, Math.round(entry.durationMin)),
        exerciseId: entry.exerciseId,
        exerciseTitle: entry.exerciseTitle,
        externalRecordId: entry.externalRecordId,
        intensity: "moderate",
        kind: "exercise",
        measuredAt: entry.measuredAt,
        met: 1,
        provider: HEALTHKIT_PROVIDER,
        source: "provider",
      }),
    );
}

export async function backfillHealthKitStepDates(
  missingDateKeys: string[],
  options: { reason?: "steps-screen"; windowKey: string },
) {
  if (!missingDateKeys.length) {
    return { attempted: 0, resolvedDateKeys: [] as string[], resolvedDays: 0, uploaded: 0 };
  }

  const inFlightKey = inFlightBackfillKey("steps", options.windowKey);
  if (healthKitRuntimeState.inFlightBackfillWindowKeys.has(inFlightKey)) {
    return { attempted: 0, resolvedDateKeys: [] as string[], resolvedDays: 0, uploaded: 0 };
  }

  healthKitRuntimeState.inFlightBackfillWindowKeys.add(inFlightKey);
  let attempted = 0;
  const resolvedDateKeys: string[] = [];

  try {
    const orderedDateKeys = [...new Set(missingDateKeys)].sort();
    const payloads: Array<Extract<CreateMeasurementArgs, { kind: "steps" }>> = [];

    for (const dateKey of orderedDateKeys) {
      const date = dateForDateKey(dateKey);
      if (!date) continue;

      attempted += 1;
      const summary = await readNativeHealthKitStepSummaryForDate(date);
      if (!summary || !summary.steps || summary.steps <= 0) continue;

      payloads.push({
        averageSpeedKph: summary.averageSpeedKph ?? undefined,
        caloriesKcal: summary.caloriesKcal ?? undefined,
        count: Math.max(0, Math.round(summary.steps)),
        distanceMeters: summary.distanceMeters ?? undefined,
        externalRecordId: `healthkit:steps:${dateKey}`,
        kind: "steps",
        measuredAt: toDayMeasuredAt(date),
        provider: HEALTHKIT_PROVIDER,
        source: "provider",
        sync: buildHealthKitStepSyncMeta(dateKey),
      });
      resolvedDateKeys.push(dateKey);
    }

    if (!payloads.length) {
      return { attempted, resolvedDateKeys: [], resolvedDays: 0, uploaded: 0 };
    }

    for (const payload of payloads) {
      await createMeasurementDirect(payload);
    }
    invalidateMeasurementCaches("steps", { includeHistory: true });

    return {
      attempted,
      resolvedDateKeys,
      resolvedDays: payloads.length,
      uploaded: payloads.length,
    };
  } finally {
    healthKitRuntimeState.inFlightBackfillWindowKeys.delete(inFlightKey);
  }
}

export async function syncTodayHealthKitSteps(
  reason: "active" | "background-task" | "background" | "interval" | "mount",
  options: { force?: boolean } = {},
) {
  const status = await getNativeHealthKitStatus();
  if (!status?.available || status.readAuthorization.steps !== "authorized") {
    return;
  }

  if (
    reason === "background-task" &&
    !status.backgroundDeliveryEnabled
  ) {
    await logHealthConnectEvent({
      event: "healthkit-steps-sync-skip-background-delivery",
      source: stepSyncEventSource(reason),
      status: "warn",
      trigger: reason,
    });
    return;
  }

  const now = new Date();
  const slotKey = stepSyncSlotKey(now);
  if (
    !options.force &&
    (healthKitRuntimeState.lastSyncedStepSlotKey === slotKey ||
      healthKitRuntimeState.inFlightStepSlotKey === slotKey)
  ) {
    return;
  }

  const summary = await readNativeHealthKitStepSummaryForDate(now);
  if (!summary?.steps || summary.steps <= 0) {
    return;
  }

  const dateKey = localDateKey(now);
  healthKitRuntimeState.inFlightStepSlotKey = slotKey;

  try {
    const payload: Extract<CreateMeasurementArgs, { kind: "steps" }> = {
      averageSpeedKph: summary.averageSpeedKph ?? undefined,
      caloriesKcal: summary.caloriesKcal ?? undefined,
      count: Math.max(0, Math.round(summary.steps)),
      distanceMeters: summary.distanceMeters ?? undefined,
      externalRecordId: `healthkit:steps:${dateKey}`,
      kind: "steps",
      measuredAt: now.toISOString(),
      provider: HEALTHKIT_PROVIDER,
      source: "provider",
      sync: buildHealthKitStepSyncMeta(dateKey),
    };

    await createMeasurementDirect(payload);
    invalidateMeasurementCaches("steps");
    healthKitRuntimeState.lastSyncedStepSlotKey = slotKey;
    await updateServerHealthConnectSyncState(recordLatestSyncedAt([payload], "steps") ?? {});
  } finally {
    if (healthKitRuntimeState.inFlightStepSlotKey === slotKey) {
      healthKitRuntimeState.inFlightStepSlotKey = null;
    }
  }
}

export async function backfillHealthKitMeasurementDates(
  kind: Exclude<BackfillableMeasurementKind, "steps">,
  missingDateKeys: string[],
  options: { reason?: "metric-screen"; windowKey: string },
) {
  if (!missingDateKeys.length) {
    return { attempted: 0, resolvedDays: 0, uploaded: 0 };
  }

  const inFlightKey = inFlightBackfillKey(kind, options.windowKey);
  if (healthKitRuntimeState.inFlightBackfillWindowKeys.has(inFlightKey)) {
    return { attempted: 0, resolvedDays: 0, uploaded: 0 };
  }

  healthKitRuntimeState.inFlightBackfillWindowKeys.add(inFlightKey);
  let attempted = 0;

  try {
    const orderedDateKeys = [...new Set(missingDateKeys)].sort();
    const allPayloads: CreateMeasurementArgs[] = [];

    for (const dateKey of orderedDateKeys) {
      const date = dateForDateKey(dateKey);
      if (!date) continue;
      attempted += 1;

      if (kind === "heart_rate") {
        const payloads = toHealthKitHeartRatePayloads(
          await readNativeHealthKitHeartRateEntriesForDate(date),
        );
        const representative = representativeHeartRatePayload(payloads);
        if (representative) {
          allPayloads.push(representative);
        }
        continue;
      }

      if (kind === "blood_pressure") {
        allPayloads.push(
          ...toHealthKitBloodPressurePayloads(
            await readNativeHealthKitBloodPressureEntriesForDate(date),
          ),
        );
        continue;
      }

      if (kind === "sleep") {
        allPayloads.push(
          ...toHealthKitSleepPayloads(await readNativeHealthKitSleepEntriesForDate(date)),
        );
        continue;
      }

      allPayloads.push(
        ...toHealthKitExercisePayloads(
          await readNativeHealthKitExerciseEntriesForDate(date),
        ),
      );
    }

    if (!allPayloads.length) {
      return { attempted, resolvedDays: 0, uploaded: 0 };
    }

    await measurementsBatchUpsert(allPayloads);
    invalidateMeasurementCaches(kind, { includeHistory: true });

    const resolvedDateKeys = new Set(
      allPayloads
        .map((payload) =>
          payload.measuredAt ? localDateKey(new Date(payload.measuredAt)) : null,
        )
        .filter((value): value is string => value !== null),
    );

    return {
      attempted,
      resolvedDays: resolvedDateKeys.size,
      uploaded: allPayloads.length,
    };
  } finally {
    healthKitRuntimeState.inFlightBackfillWindowKeys.delete(inFlightKey);
  }
}

export async function syncRecentHealthKitMeasurements(
  reason: "active" | "background-task" | "interval" | "mount",
  options: { force?: boolean } = {},
) {
  const status = await getNativeHealthKitStatus();
  if (!status?.available) {
    return;
  }

  if (
    !options.force &&
    (healthKitRuntimeState.healthKitSyncPromise ||
      Date.now() - healthKitRuntimeState.lastHealthKitSyncStartedAt <
        MIN_BACKGROUND_SYNC_INTERVAL_MS)
  ) {
    return healthKitRuntimeState.healthKitSyncPromise ?? undefined;
  }

  healthKitRuntimeState.lastHealthKitSyncStartedAt = Date.now();
  healthKitRuntimeState.healthKitSyncPromise = (async () => {
    const pendingTypes = options.force
      ? (["blood_pressure", "exercise", "heart_rate", "sleep", "steps"] as const)
      : await consumeNativeHealthKitPendingObserverTypes();

    const authorizedMeasurementTypes = [
      "blood_pressure",
      "exercise",
      "heart_rate",
      "sleep",
    ] as const;

    const requestedTypes =
      options.force || reason !== "background-task"
        ? authorizedMeasurementTypes
        : authorizedMeasurementTypes.filter((type) => pendingTypes.includes(type));

    if (!requestedTypes.length) {
      return;
    }

    await logHealthConnectEvent({
      event: "healthkit-sync-start",
      payload: { force: Boolean(options.force), pendingTypes },
      source: measurementSyncEventSource(reason),
      status: "info",
      trigger: reason,
    });

    const syncState = await getServerHealthConnectSyncState();
    const allPayloads: CreateMeasurementArgs[] = [];
    const syncStatePatch: Record<string, { lastSyncedAt: string }> = {};
    const changedKinds = new Set<CreateMeasurementArgs["kind"]>();

    for (const type of requestedTypes) {
      const lastSyncedAtValue = syncState.recordTypes?.[type]?.lastSyncedAt;
      const startDate =
        typeof lastSyncedAtValue === "string" ? new Date(lastSyncedAtValue) : null;

      if (type === "heart_rate") {
        const payloads = (await readNativeHealthKitAnchoredHeartRateChanges(startDate))
          .filter(
            (
              sample,
            ): sample is {
              externalRecordId: string;
              measuredAt: string;
              value: number;
              value2: number | null;
            } =>
              typeof sample.externalRecordId === "string" &&
              typeof sample.measuredAt === "string" &&
              typeof sample.value === "number" &&
              Number.isFinite(sample.value),
          )
          .map(
            (sample): Extract<CreateMeasurementArgs, { kind: "heart_rate" }> => ({
              bpm: Math.round(sample.value),
              externalRecordId: sample.externalRecordId,
              kind: "heart_rate",
              measuredAt: sample.measuredAt,
              provider: HEALTHKIT_PROVIDER,
              source: "provider",
            }),
          );

        allPayloads.push(...payloads);
        if (payloads.length) {
          changedKinds.add("heart_rate");
          Object.assign(syncStatePatch, recordLatestSyncedAt(payloads, "heart_rate"));
        }
        continue;
      }

      if (type === "blood_pressure") {
        const payloads = (await readNativeHealthKitAnchoredBloodPressureChanges(startDate))
          .filter(
            (
              sample,
            ): sample is {
              diastolicMmHg: number;
              externalRecordId: string;
              measuredAt: string;
              systolicMmHg: number;
            } =>
              typeof sample.externalRecordId === "string" &&
              typeof sample.measuredAt === "string" &&
              typeof sample.systolicMmHg === "number" &&
              Number.isFinite(sample.systolicMmHg) &&
              typeof sample.diastolicMmHg === "number" &&
              Number.isFinite(sample.diastolicMmHg),
          )
          .map(
            (sample): Extract<CreateMeasurementArgs, { kind: "blood_pressure" }> => ({
              diastolicMmHg: Math.round(sample.diastolicMmHg),
              externalRecordId: sample.externalRecordId,
              kind: "blood_pressure",
              measuredAt: sample.measuredAt,
              provider: HEALTHKIT_PROVIDER,
              source: "provider",
              systolicMmHg: Math.round(sample.systolicMmHg),
            }),
          );

        allPayloads.push(...payloads);
        if (payloads.length) {
          changedKinds.add("blood_pressure");
          Object.assign(syncStatePatch, recordLatestSyncedAt(payloads, "blood_pressure"));
        }
        continue;
      }

      if (type === "sleep") {
        const payloads = (await readNativeHealthKitAnchoredSleepChanges(startDate))
          .filter(
            (
              sample,
            ): sample is {
              durationMin: number;
              externalRecordId: string;
              measuredAt: string;
              sleepFromAt: string;
              sleepToAt: string;
            } =>
              typeof sample.externalRecordId === "string" &&
              typeof sample.measuredAt === "string" &&
              typeof sample.sleepFromAt === "string" &&
              typeof sample.sleepToAt === "string" &&
              typeof sample.durationMin === "number" &&
              Number.isFinite(sample.durationMin),
          )
          .map(
            (sample): Extract<CreateMeasurementArgs, { kind: "sleep" }> => ({
              durationMin: Math.max(0, Math.round(sample.durationMin)),
              externalRecordId: sample.externalRecordId,
              kind: "sleep",
              measuredAt: sample.measuredAt,
              provider: HEALTHKIT_PROVIDER,
              sleepFromAt: sample.sleepFromAt,
              sleepToAt: sample.sleepToAt,
              source: "provider",
            }),
          );

        allPayloads.push(...payloads);
        if (payloads.length) {
          changedKinds.add("sleep");
          Object.assign(syncStatePatch, recordLatestSyncedAt(payloads, "sleep"));
        }
        continue;
      }

      const payloads = (await readNativeHealthKitAnchoredExerciseChanges(startDate))
        .filter(
          (
            sample,
          ): sample is {
            caloriesKcal: number | null;
            durationMin: number;
            exerciseId: string;
            exerciseTitle: string;
            externalRecordId: string;
            measuredAt: string;
          } =>
            typeof sample.externalRecordId === "string" &&
            typeof sample.measuredAt === "string" &&
            typeof sample.exerciseId === "string" &&
            typeof sample.exerciseTitle === "string" &&
            typeof sample.durationMin === "number" &&
            Number.isFinite(sample.durationMin),
        )
        .map(
          (sample): Extract<CreateMeasurementArgs, { kind: "exercise" }> => ({
            caloriesKcal:
              typeof sample.caloriesKcal === "number" && Number.isFinite(sample.caloriesKcal)
                ? Math.max(0, Math.round(sample.caloriesKcal))
                : undefined,
            category: "healthkit",
            durationMin: Math.max(0, Math.round(sample.durationMin)),
            exerciseId: sample.exerciseId,
            exerciseTitle: sample.exerciseTitle,
            externalRecordId: sample.externalRecordId,
            intensity: "moderate",
            kind: "exercise",
            measuredAt: sample.measuredAt,
            met: 1,
            provider: HEALTHKIT_PROVIDER,
            source: "provider",
          }),
        );

      allPayloads.push(...payloads);
      if (payloads.length) {
        changedKinds.add("exercise");
        Object.assign(syncStatePatch, recordLatestSyncedAt(payloads, "exercise"));
      }
    }

    if (!allPayloads.length) {
      return;
    }

    await measurementsBatchUpsert(allPayloads);
    await updateServerHealthConnectSyncState(syncStatePatch);
    for (const kind of changedKinds) {
      invalidateMeasurementCaches(kind, { includeHistory: true });
    }
  })()
    .catch(async (error) => {
      console.log("HealthKit sync failed", error);
      await logHealthConnectEvent({
        event: "healthkit-sync-fail",
        payload: {
          error: error instanceof Error ? error.message : String(error),
        },
        source: measurementSyncEventSource(reason),
        status: "error",
        trigger: reason,
      });
    })
    .finally(() => {
      healthKitRuntimeState.healthKitSyncPromise = null;
    });

  return healthKitRuntimeState.healthKitSyncPromise;
}
