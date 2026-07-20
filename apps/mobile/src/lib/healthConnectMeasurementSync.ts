import { Platform } from "react-native";

import { logHealthConnectEvent } from "@/lib/healthConnectEventLogger";
import { ANDROID_HEALTH_RECORD_PERMISSIONS } from "@/lib/healthConnectPermissions";
import {
  createMeasurementDirect,
  dayRangeForDateKey,
  type HealthRecord,
  isHealthConnectQuotaError,
  localDateKey,
  measurementsBatchUpsert,
  readRecentRecords,
  representativeHeartRatePayload,
  toMeasurementPayloads,
  type HealthRecordType,
} from "@/lib/healthConnectSyncPipeline";
import {
  type BackfillableMeasurementKind,
  type HealthConnectSyncStateResponse,
  type SyncStateRecordType,
  getServerHealthConnectSyncState,
  healthConnectSyncWindow,
  HEALTH_CONNECT_QUOTA_COOLDOWN_MS,
  invalidateMeasurementCaches,
  MAX_UPLOADS_PER_SYNC,
  measurementSyncEventSource,
  MIN_BACKGROUND_SYNC_INTERVAL_MS,
  syncStateRecordType,
  updateServerHealthConnectSyncState,
} from "@/lib/healthConnectSyncCommon";
import {
  clearStoredHealthConnectChangesState,
  failedMeasurementRetryAt,
  failedMeasurementRetryMs,
  healthConnectRuntimeState,
  loadStoredHealthConnectChangesState,
  saveStoredHealthConnectChangesState,
  syncedMeasurementKeys,
} from "@/lib/healthConnectSyncState";
import { hasHealthConnectBackgroundReadPermission } from "@/lib/healthConnectStepSync";
import type {
  CreateMeasurementArgs,
  MeasurementDayEntry,
} from "@/store/services/types";

function recordTypesForBackfillKind(
  kind: Exclude<BackfillableMeasurementKind, "steps">,
) {
  if (kind === "sleep") return ["SleepSession"] as const;
  if (kind === "exercise") return ["ExerciseSession"] as const;
  if (kind === "heart_rate") return ["HeartRate", "RestingHeartRate"] as const;
  return ["BloodPressure"] as const;
}

function isHealthConnectSyncRecordType(value: string): value is HealthRecordType {
  return (
    value === "BloodPressure" ||
    value === "ExerciseSession" ||
    value === "HeartRate" ||
    value === "RestingHeartRate" ||
    value === "SleepSession"
  );
}

function supportedHealthConnectSyncRecordTypes(
  granted: ReadonlySet<string>,
): HealthRecordType[] {
  const recordTypes = new Set<HealthRecordType>();

  for (const permission of ANDROID_HEALTH_RECORD_PERMISSIONS) {
    const recordType = permission.recordType as HealthRecordType;
    if (granted.has(`${permission.accessType}:${permission.recordType}`)) {
      recordTypes.add(recordType);
    }
  }

  return [...recordTypes];
}

async function bootstrapHealthConnectChangesToken(
  healthConnect: typeof import("react-native-health-connect"),
  recordTypes: HealthRecordType[],
) {
  const changes = await healthConnect.getChanges({ recordTypes });
  await saveStoredHealthConnectChangesState(changes.nextChangesToken);
  return changes.nextChangesToken;
}

async function syncHealthConnectRecordsFromWindows(
  healthConnect: typeof import("react-native-health-connect"),
  recordTypes: HealthRecordType[],
  syncState: HealthConnectSyncStateResponse,
) {
  const changedKinds = new Set<CreateMeasurementArgs["kind"]>();
  const latestSyncedAtByType: Partial<Record<SyncStateRecordType, string>> = {};

  // Collect qualifying payloads across all record types first.
  const batch: CreateMeasurementArgs[] = [];
  const batchKeys: string[] = [];
  const batchRecordTypes: HealthRecordType[] = [];
  let quotaExceeded = false;

  for (const recordType of recordTypes) {
    if (batch.length >= MAX_UPLOADS_PER_SYNC) break;

    try {
      const syncWindow = healthConnectSyncWindow(syncState, recordType);
      const records = await readRecentRecords(healthConnect, recordType, syncWindow);
      const payloads = toMeasurementPayloads(recordType, records).sort((a, b) =>
        String(b.measuredAt ?? "").localeCompare(String(a.measuredAt ?? "")),
      );

      for (const payload of payloads) {
        if (!payload.externalRecordId || batch.length >= MAX_UPLOADS_PER_SYNC) continue;
        const syncKey = `${payload.externalRecordId}:${payload.measuredAt}`;
        const retryAfter = failedMeasurementRetryAt.get(syncKey) ?? 0;
        if (syncedMeasurementKeys.has(syncKey) || retryAfter > Date.now()) continue;
        batch.push(payload);
        batchKeys.push(syncKey);
        batchRecordTypes.push(recordType);
      }
    } catch (error) {
      if (isHealthConnectQuotaError(error)) {
        healthConnectRuntimeState.lastHealthConnectQuotaRetryAt =
          Date.now() + HEALTH_CONNECT_QUOTA_COOLDOWN_MS;
        console.log("Health Connect quota exceeded, pausing sync", {
          recordType,
          retryAt: new Date(healthConnectRuntimeState.lastHealthConnectQuotaRetryAt).toISOString(),
        });
        quotaExceeded = true;
        break;
      }
      console.log("Health Connect record read failed", { error, recordType });
    }
  }

  if (!quotaExceeded && batch.length > 0) {
    try {
      await measurementsBatchUpsert(batch);
      for (let i = 0; i < batch.length; i++) {
        syncedMeasurementKeys.add(batchKeys[i]!);
        failedMeasurementRetryAt.delete(batchKeys[i]!);
        changedKinds.add(batch[i]!.kind);
        const syncType = syncStateRecordType(batchRecordTypes[i]!);
        const measuredAt = batch[i]!.measuredAt;
        if (measuredAt && (!latestSyncedAtByType[syncType] || measuredAt.localeCompare(latestSyncedAtByType[syncType]!) > 0)) {
          latestSyncedAtByType[syncType] = measuredAt;
        }
      }
    } catch (error) {
      const retryAt = Date.now() + failedMeasurementRetryMs();
      for (const key of batchKeys) {
        failedMeasurementRetryAt.set(key, retryAt);
      }
      console.log("Health Connect window sync batch failed", { error, count: batch.length });
    }
  }

  return { changedKinds, latestSyncedAtByType, uploads: batch.length };
}

async function syncHealthConnectRecordsFromChanges(
  healthConnect: typeof import("react-native-health-connect"),
  token: string,
  recordTypes: ReadonlySet<HealthRecordType>,
) {
  let deletionCount = 0;
  let nextToken = token;
  const changedKinds = new Set<CreateMeasurementArgs["kind"]>();
  const latestSyncedAtByType: Partial<Record<SyncStateRecordType, string>> = {};

  // Collect qualifying payloads across all change pages first.
  const batch: CreateMeasurementArgs[] = [];
  const batchKeys: string[] = [];
  const batchRecordTypes: HealthRecordType[] = [];

  for (;;) {
    const changes = await healthConnect.getChanges({ changesToken: nextToken });
    if (changes.changesTokenExpired) {
      return {
        changedKinds,
        changesTokenExpired: true,
        deletionCount,
        latestSyncedAtByType,
        nextToken: null,
        uploads: 0,
      };
    }

    nextToken = changes.nextChangesToken;
    deletionCount += changes.deletionChanges.length;

    for (const upsertion of changes.upsertionChanges) {
      if (batch.length >= MAX_UPLOADS_PER_SYNC) break;
      const record = upsertion.record as unknown as HealthRecord & { recordType?: string };
      const recordType = record.recordType;
      if (
        typeof recordType !== "string" ||
        !isHealthConnectSyncRecordType(recordType) ||
        !recordTypes.has(recordType)
      ) continue;

      const payloads = toMeasurementPayloads(recordType, [record]).sort(
        (a, b) => String(b.measuredAt ?? "").localeCompare(String(a.measuredAt ?? "")),
      );

      for (const payload of payloads) {
        if (!payload.externalRecordId || batch.length >= MAX_UPLOADS_PER_SYNC) continue;
        const syncKey = `${payload.externalRecordId}:${payload.measuredAt}`;
        const retryAfter = failedMeasurementRetryAt.get(syncKey) ?? 0;
        if (syncedMeasurementKeys.has(syncKey) || retryAfter > Date.now()) continue;
        batch.push(payload);
        batchKeys.push(syncKey);
        batchRecordTypes.push(recordType as HealthRecordType);
      }
    }

    if (!changes.hasMore || batch.length >= MAX_UPLOADS_PER_SYNC) break;
  }

  if (batch.length > 0) {
    try {
      await measurementsBatchUpsert(batch);
      for (let i = 0; i < batch.length; i++) {
        syncedMeasurementKeys.add(batchKeys[i]!);
        failedMeasurementRetryAt.delete(batchKeys[i]!);
        changedKinds.add(batch[i]!.kind);
        const syncType = syncStateRecordType(batchRecordTypes[i]!);
        const measuredAt = batch[i]!.measuredAt;
        if (measuredAt && (!latestSyncedAtByType[syncType] || measuredAt.localeCompare(latestSyncedAtByType[syncType]!) > 0)) {
          latestSyncedAtByType[syncType] = measuredAt;
        }
      }
    } catch (error) {
      const retryAt = Date.now() + failedMeasurementRetryMs();
      for (const key of batchKeys) {
        failedMeasurementRetryAt.set(key, retryAt);
      }
      console.log("Health Connect changes sync batch failed", { error, count: batch.length });
    }
  }

  return {
    changedKinds,
    changesTokenExpired: false,
    deletionCount,
    latestSyncedAtByType,
    nextToken,
    uploads: batch.length,
  };
}

export async function readHealthConnectHeartRateEntriesForDate(date: Date) {
  if (Platform.OS !== "android") {
    return [] as MeasurementDayEntry[];
  }

  const timeRange = dayRangeForDateKey(localDateKey(date));
  if (!timeRange) {
    return [] as MeasurementDayEntry[];
  }

  const healthConnect = await import("react-native-health-connect");
  const initialized = await healthConnect.initialize();
  if (!initialized) {
    return [] as MeasurementDayEntry[];
  }

  const payloads: CreateMeasurementArgs[] = [];
  for (const recordType of ["HeartRate", "RestingHeartRate"] as const) {
    const records = await readRecentRecords(healthConnect, recordType, timeRange);
    const mappedPayloads = toMeasurementPayloads(recordType, records);
    payloads.push(...mappedPayloads);
  }

  const seen = new Set<string>();
  return payloads
    .filter(
      (payload): payload is CreateMeasurementArgs & { bpm: number; measuredAt: string } =>
        payload.kind === "heart_rate" &&
        typeof payload.bpm === "number" &&
        Number.isFinite(payload.bpm) &&
        typeof payload.measuredAt === "string",
    )
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
    .filter((payload) => {
      const key = `${payload.measuredAt}:${payload.bpm}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map((payload) => ({
      canDelete: false,
      canEdit: false,
      entryId: `health-connect:heart_rate:${payload.measuredAt}:${payload.bpm}`,
      measuredAt: payload.measuredAt,
      source: "provider" as const,
      value: payload.bpm,
      value2: null,
    }));
}

export async function syncHealthConnectHeartRateEntriesForDate(
  date: Date,
  existingEntries: MeasurementDayEntry[] = [],
) {
  if (Platform.OS !== "android") {
    return {
      entries: [] as MeasurementDayEntry[],
      uploaded: 0,
    };
  }

  const timeRange = dayRangeForDateKey(localDateKey(date));
  if (!timeRange) {
    return {
      entries: [] as MeasurementDayEntry[],
      uploaded: 0,
    };
  }

  const healthConnect = await import("react-native-health-connect");
  const initialized = await healthConnect.initialize();
  if (!initialized) {
    return {
      entries: [] as MeasurementDayEntry[],
      uploaded: 0,
    };
  }

  const payloads: CreateMeasurementArgs[] = [];
  for (const recordType of ["HeartRate", "RestingHeartRate"] as const) {
    const records = await readRecentRecords(healthConnect, recordType, timeRange);
    payloads.push(...toMeasurementPayloads(recordType, records));
  }

  const existingKeys = new Set(
    existingEntries
      .filter(
        (entry) =>
          typeof entry.value === "number" &&
          Number.isFinite(entry.value) &&
          typeof entry.measuredAt === "string",
      )
      .map((entry) => `${entry.measuredAt}:${Math.round(entry.value as number)}`),
  );

  const uniquePayloads = payloads
    .filter(
      (payload): payload is CreateMeasurementArgs & { bpm: number; measuredAt: string } =>
        payload.kind === "heart_rate" &&
        typeof payload.bpm === "number" &&
        Number.isFinite(payload.bpm) &&
        typeof payload.measuredAt === "string",
    )
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
    .filter((payload, index, all) => {
      const key = `${payload.measuredAt}:${payload.bpm}`;
      return index === all.findIndex((candidate) => (
        `${candidate.measuredAt}:${candidate.bpm}` === key
      ));
    });

  let uploaded = 0;
  for (const payload of uniquePayloads) {
    const key = `${payload.measuredAt}:${payload.bpm}`;
    if (existingKeys.has(key)) {
      continue;
    }
    await createMeasurementDirect(payload);
    existingKeys.add(key);
    uploaded += 1;
  }

  if (uploaded > 0) {
    invalidateMeasurementCaches("heart_rate", { includeHistory: true });
  }

  return {
    entries: uniquePayloads.map((payload) => ({
      measuredAt: payload.measuredAt,
      value: payload.bpm,
      value2: null,
    })),
    uploaded,
  };
}

export async function backfillHealthConnectMeasurementDates(
  kind: Exclude<BackfillableMeasurementKind, "steps">,
  missingDateKeys: string[],
  options: {
    reason?: "metric-screen";
    windowKey: string;
  },
) {
  if (Platform.OS !== "android" || !missingDateKeys.length) {
    return { attempted: 0, resolvedDays: 0, uploaded: 0 };
  }

  const inFlightKey = `${kind}:${options.windowKey}`;
  if (healthConnectRuntimeState.inFlightBackfillWindowKeys.has(inFlightKey)) {
    return { attempted: 0, resolvedDays: 0, uploaded: 0 };
  }

  healthConnectRuntimeState.inFlightBackfillWindowKeys.add(inFlightKey);
  let attempted = 0;

  try {
    const healthConnect = await import("react-native-health-connect");
    const initialized = await healthConnect.initialize();
    if (!initialized) {
      return { attempted: 0, resolvedDays: 0, uploaded: 0 };
    }
    const grantedPermissions = await healthConnect.getGrantedPermissions();
    const granted = new Set(
      grantedPermissions.map(
        (permission) => `${permission.accessType}:${permission.recordType}`,
      ),
    );

    const orderedDateKeys = [...new Set(missingDateKeys)].sort();
    const recordTypes = recordTypesForBackfillKind(kind);
    const missingPermission = recordTypes.some(
      (recordType) => !granted.has(`read:${recordType}`),
    );
    if (missingPermission) {
      throw new Error("Health Connect permission is missing for this metric.");
    }

    // Collect all payloads across every day first, then send as one batch.
    const allPayloads: CreateMeasurementArgs[] = [];

    for (const dateKey of orderedDateKeys) {
      const timeRange = dayRangeForDateKey(dateKey);
      if (!timeRange) continue;
      attempted += 1;

      for (const recordType of recordTypes) {
        const records = await readRecentRecords(healthConnect, recordType, timeRange);
        const dayPayloads = toMeasurementPayloads(recordType, records);

        if (kind === "heart_rate") {
          // One representative reading per record-type per day to avoid
          // uploading 20+ individual samples per day.
          const representative = representativeHeartRatePayload(dayPayloads);
          if (representative) allPayloads.push(representative);
          continue;
        }

        allPayloads.push(...dayPayloads);
      }
    }

    if (!allPayloads.length) {
      return { attempted, resolvedDays: 0, uploaded: 0 };
    }

    await measurementsBatchUpsert(allPayloads);
    invalidateMeasurementCaches(kind, { includeHistory: true });

    const resolvedDateKeys = new Set(
      allPayloads
        .map((p) => (p.measuredAt ? localDateKey(new Date(p.measuredAt)) : null))
        .filter((dk): dk is string => dk !== null),
    );

    return { attempted, resolvedDays: resolvedDateKeys.size, uploaded: allPayloads.length };
  } finally {
    healthConnectRuntimeState.inFlightBackfillWindowKeys.delete(inFlightKey);
  }
}

export async function syncRecentHealthConnectMeasurements(
  reason: "active" | "background-task" | "interval" | "mount",
  options: { force?: boolean } = {},
) {
  if (Platform.OS !== "android") return;

  if (
    !options.force &&
    Date.now() < healthConnectRuntimeState.lastHealthConnectQuotaRetryAt
  ) {
    await logHealthConnectEvent({
      event: "health-connect-sync-skip-cooldown",
      source: measurementSyncEventSource(reason),
      status: "warn",
      trigger: reason,
    });
    return;
  }

  if (reason === "background-task") {
    const canReadInBackground = await hasHealthConnectBackgroundReadPermission();
    if (!canReadInBackground) {
      await logHealthConnectEvent({
        event: "health-connect-sync-skip-background-permission",
        source: measurementSyncEventSource(reason),
        status: "warn",
        trigger: reason,
      });
      return;
    }
  }

  const now = Date.now();
  if (
    !options.force &&
    (healthConnectRuntimeState.healthConnectSyncPromise ||
      now - healthConnectRuntimeState.lastHealthConnectSyncStartedAt <
        MIN_BACKGROUND_SYNC_INTERVAL_MS)
  ) {
    await logHealthConnectEvent({
      event: "health-connect-sync-skip-interval",
      payload: {
        hasInFlightSync: Boolean(healthConnectRuntimeState.healthConnectSyncPromise),
      },
      source: measurementSyncEventSource(reason),
      status: "info",
      trigger: reason,
    });
    return healthConnectRuntimeState.healthConnectSyncPromise;
  }

  healthConnectRuntimeState.lastHealthConnectSyncStartedAt = now;
  healthConnectRuntimeState.healthConnectSyncPromise = (async () => {
    let uploads = 0;
    let deletionCount = 0;
    const changedKinds = new Set<CreateMeasurementArgs["kind"]>();
    const latestSyncedAtByType: Partial<Record<SyncStateRecordType, string>> = {};
    await logHealthConnectEvent({
      event: "health-connect-sync-start",
      payload: { force: Boolean(options.force) },
      source: measurementSyncEventSource(reason),
      status: "info",
      trigger: reason,
    });

    try {
      const healthConnect = await import("react-native-health-connect");
      const initialized = await healthConnect.initialize();
      if (!initialized) return;
      const syncState = await getServerHealthConnectSyncState();

      const grantedPermissions = await healthConnect.getGrantedPermissions();
      const granted = new Set(
        grantedPermissions.map(
          (permission) => `${permission.accessType}:${permission.recordType}`,
        ),
      );
      const recordTypes = supportedHealthConnectSyncRecordTypes(granted);
      if (!recordTypes.length) {
        return;
      }

      const storedChangesState = await loadStoredHealthConnectChangesState();
      if (!storedChangesState?.token) {
        const fullSync = await syncHealthConnectRecordsFromWindows(
          healthConnect,
          recordTypes,
          syncState,
        );
        uploads += fullSync.uploads;
        for (const kind of fullSync.changedKinds) {
          changedKinds.add(kind);
        }
        Object.assign(latestSyncedAtByType, fullSync.latestSyncedAtByType);
        await bootstrapHealthConnectChangesToken(healthConnect, recordTypes);
      } else {
        const incrementalSync = await syncHealthConnectRecordsFromChanges(
          healthConnect,
          storedChangesState.token,
          new Set(recordTypes),
        );

        if (incrementalSync.changesTokenExpired) {
          await clearStoredHealthConnectChangesState();
          const fullSync = await syncHealthConnectRecordsFromWindows(
            healthConnect,
            recordTypes,
            syncState,
          );
          uploads += fullSync.uploads;
          for (const kind of fullSync.changedKinds) {
            changedKinds.add(kind);
          }
          Object.assign(latestSyncedAtByType, fullSync.latestSyncedAtByType);
          await bootstrapHealthConnectChangesToken(healthConnect, recordTypes);
          await logHealthConnectEvent({
            event: "health-connect-sync-token-expired",
            source: measurementSyncEventSource(reason),
            status: "warn",
            trigger: reason,
          });
        } else {
          uploads += incrementalSync.uploads;
          deletionCount += incrementalSync.deletionCount;
          for (const kind of incrementalSync.changedKinds) {
            changedKinds.add(kind);
          }
          Object.assign(latestSyncedAtByType, incrementalSync.latestSyncedAtByType);
          if (incrementalSync.nextToken) {
            await saveStoredHealthConnectChangesState(incrementalSync.nextToken);
          }
        }
      }
    } catch (error) {
      if (isHealthConnectQuotaError(error)) {
        healthConnectRuntimeState.lastHealthConnectQuotaRetryAt =
          Date.now() + HEALTH_CONNECT_QUOTA_COOLDOWN_MS;
        console.log("Health Connect quota exceeded, pausing sync", {
          reason,
          retryAt: new Date(
            healthConnectRuntimeState.lastHealthConnectQuotaRetryAt,
          ).toISOString(),
        });
        return;
      }

      console.log("Health Connect sync failed", error);
      await logHealthConnectEvent({
        event: "health-connect-sync-fail",
        payload: {
          error: error instanceof Error ? error.message : String(error),
        },
        source: measurementSyncEventSource(reason),
        status: "error",
        trigger: reason,
      });
    } finally {
      await logHealthConnectEvent({
        event: "health-connect-sync-finish",
        payload: {
          changedKinds: [...changedKinds],
          deletionCount,
          uploads,
        },
        source: measurementSyncEventSource(reason),
        status: "info",
        trigger: reason,
      });
      if (Object.keys(latestSyncedAtByType).length > 0) {
        await updateServerHealthConnectSyncState(
          Object.fromEntries(
            Object.entries(latestSyncedAtByType).map(([recordType, lastSyncedAt]) => [
              recordType,
              { lastSyncedAt: lastSyncedAt! },
            ]),
          ) as Partial<Record<SyncStateRecordType, { lastSyncedAt: string }>>,
        );
      }
      if (changedKinds.size > 0) {
        for (const kind of changedKinds) {
          invalidateMeasurementCaches(kind);
        }
      }
      healthConnectRuntimeState.healthConnectSyncPromise = null;
    }
  })();

  return healthConnectRuntimeState.healthConnectSyncPromise;
}
