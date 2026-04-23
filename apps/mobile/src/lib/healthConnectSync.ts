import { Platform } from "react-native";
import { ExerciseType } from "react-native-health-connect";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { loadAndroidStepState } from "@/lib/healthConnectStepSummary";
import {
  ANDROID_HEALTH_BACKGROUND_READ_PERMISSION,
  ANDROID_HEALTH_RECORD_PERMISSIONS,
} from "@/lib/healthConnectPermissions";
import { store } from "@/store";
import { measurementsApi } from "@/store/services/measurementsApi";
import type { CreateMeasurementArgs } from "@/store/services/types";

const FAILED_SYNC_RETRY_MS = 10 * 60_000;
const MAX_UPLOADS_PER_SYNC = 100;
const MIN_BACKGROUND_SYNC_INTERVAL_MS = 15 * 60_000;
const FOREGROUND_SYNC_INTERVAL_MS = 5 * 60_000;
const HEALTH_CONNECT_SYNC_OVERLAP_MS = 5 * 60_000;

const syncedMeasurementKeys = new Set<string>();
const failedMeasurementRetryAt = new Map<string, number>();

let healthConnectSyncPromise: Promise<void> | null = null;
let lastHealthConnectSyncStartedAt = 0;
let lastSyncedStepSlotKey: string | null = null;
let inFlightStepSlotKey: string | null = null;

type HealthRecordType =
  | "BloodPressure"
  | "ExerciseSession"
  | "HeartRate"
  | "RestingHeartRate"
  | "SleepSession";

type SyncStateRecordType =
  | "blood_pressure"
  | "exercise"
  | "heart_rate"
  | "sleep"
  | "steps";

type HealthConnectSyncStateResponse = {
  provider: "health_connect";
  recordTypes?: Partial<
    Record<
      SyncStateRecordType,
      {
        lastSyncedAt?: string;
      }
    >
  >;
  updatedAt?: string | null;
};

type HealthMetadata = {
  clientRecordId?: string;
  dataOrigin?: string;
  device?: {
    manufacturer?: string;
    model?: string;
    type?: number;
  };
  id?: string;
};

type HealthRecord = {
  beatsPerMinute?: number;
  caloriesKcal?: number;
  diastolic?: { inMillimetersOfMercury?: number; value?: number };
  endTime?: string;
  exerciseType?: number;
  metadata?: HealthMetadata;
  samples?: { beatsPerMinute?: number; time?: string }[];
  startTime?: string;
  systolic?: { inMillimetersOfMercury?: number; value?: number };
  time?: string;
  title?: string;
};

const EXERCISE_TYPE_LABELS = Object.entries(ExerciseType).reduce<
  Record<number, string>
>((acc, [key, value]) => {
  if (typeof value !== "number") {
    return acc;
  }
  acc[value] = key
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return acc;
}, {});

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function stepSyncSlotKey(date: Date) {
  const dateKey = localDateKey(date);
  const slot = Math.floor(date.getTime() / FOREGROUND_SYNC_INTERVAL_MS);
  return `${dateKey}:${slot}`;
}

async function createMeasurementDirect(payload: CreateMeasurementArgs) {
  const response = await authFetch(`${API}/api/measurements/create`, {
    body: JSON.stringify(payload),
    method: "POST",
  });
  const body = (await response.json().catch(() => null)) as
    | { message?: string; ok?: boolean }
    | null;

  if (!response.ok || !body?.ok) {
    throw new Error(body?.message ?? "Failed to create measurement");
  }

  return body;
}

function invalidateMeasurementCaches(
  kind: CreateMeasurementArgs["kind"],
  options: { includeHistory?: boolean } = {},
) {
  const tags: Parameters<typeof measurementsApi.util.invalidateTags>[0] = [
    { id: "latest", type: "Fitness" as const },
    { id: "today", type: "Dashboard" as const },
  ];

  if (options.includeHistory) {
    tags.push(
      { id: "history", type: "Fitness" as const },
      { id: `history:${kind}`, type: "Fitness" as const },
    );
  }

  store.dispatch(measurementsApi.util.invalidateTags(tags));
}

function syncStateRecordType(recordType: HealthRecordType): SyncStateRecordType {
  switch (recordType) {
    case "BloodPressure":
      return "blood_pressure";
    case "ExerciseSession":
      return "exercise";
    case "SleepSession":
      return "sleep";
    default:
      return "heart_rate";
  }
}

async function getServerHealthConnectSyncState() {
  const response = await authFetch(`${API}/api/users/health-connect/sync-state`);
  const body = (await response.json().catch(() => null)) as
    | { data?: HealthConnectSyncStateResponse; message?: string; ok?: boolean }
    | null;

  if (!response.ok || !body?.ok || !body.data) {
    throw new Error(body?.message ?? "Failed to load Health Connect sync state");
  }

  return body.data;
}

async function updateServerHealthConnectSyncState(
  recordTypes: Partial<Record<SyncStateRecordType, { lastSyncedAt: string }>>,
) {
  const response = await authFetch(`${API}/api/users/health-connect/sync-state`, {
    body: JSON.stringify({ recordTypes }),
    method: "PATCH",
  });
  const body = (await response.json().catch(() => null)) as
    | { message?: string; ok?: boolean }
    | null;

  if (!response.ok || !body?.ok) {
    throw new Error(body?.message ?? "Failed to update Health Connect sync state");
  }
}

function healthConnectSyncWindow(
  syncState: HealthConnectSyncStateResponse,
  recordType: HealthRecordType,
) {
  const end = new Date();
  const syncType = syncStateRecordType(recordType);
  const lastSyncedAtValue = syncState.recordTypes?.[syncType]?.lastSyncedAt;
  const lastSyncedAt = lastSyncedAtValue ? new Date(lastSyncedAtValue) : null;
  const start =
    lastSyncedAt && !Number.isNaN(lastSyncedAt.getTime())
      ? new Date(lastSyncedAt.getTime() - HEALTH_CONNECT_SYNC_OVERLAP_MS)
      : new Date(end.getTime() - 60_000);

  if (start.getTime() >= end.getTime()) {
    start.setTime(end.getTime() - 60_000);
  }

  return {
    endTime: end.toISOString(),
    startTime: start.toISOString(),
  };
}

function providerPackageName(metadata?: HealthMetadata) {
  return metadata?.dataOrigin?.trim() || "android.healthconnect";
}

function providerDisplayName(packageName: string) {
  return packageName.split(".").filter(Boolean).at(-1) ?? packageName;
}

function resolvedStepProvider(
  selectedDataOrigin: string | null,
  dataOrigins: string[],
) {
  const packageName =
    selectedDataOrigin?.trim() ||
    dataOrigins.find((origin) => origin && origin !== "android") ||
    dataOrigins[0] ||
    "android.healthconnect";

  return {
    displayName: providerDisplayName(packageName),
    packageName,
  };
}

function externalRecordId(
  recordType: HealthRecordType,
  record: HealthRecord,
  fallbackTime: string,
  sampleKey?: string,
) {
  const origin = providerPackageName(record.metadata);
  const recordId =
    record.metadata?.id?.trim() || record.metadata?.clientRecordId?.trim();
  const suffix = sampleKey?.trim();
  if (recordId) {
    return suffix
      ? `health-connect:${origin}:${recordType}:${recordId}:${suffix}`
      : `health-connect:${origin}:${recordType}:${recordId}`;
  }
  return suffix
    ? `health-connect:${origin}:${recordType}:${fallbackTime}:${suffix}`
    : `health-connect:${origin}:${recordType}:${fallbackTime}`;
}

function provenance(
  recordType: HealthRecordType,
  record: HealthRecord,
  time: string,
  sampleKey?: string,
) {
  const packageName = providerPackageName(record.metadata);
  const manufacturer = record.metadata?.device?.manufacturer?.trim();
  const model = record.metadata?.device?.model?.trim();

  return {
    device:
      manufacturer || model
        ? {
            externalId: [packageName, manufacturer, model]
              .filter(Boolean)
              .join(":"),
            name: [manufacturer, model].filter(Boolean).join(" "),
            platform: "Health Connect",
          }
        : undefined,
    externalRecordId: externalRecordId(recordType, record, time, sampleKey),
    provider: {
      displayName: providerDisplayName(packageName),
      packageName,
    },
    source: "provider" as const,
  };
}

function pressureValue(value?: {
  inMillimetersOfMercury?: number;
  value?: number;
}) {
  return value?.inMillimetersOfMercury ?? value?.value ?? null;
}

function durationMinutes(startTime?: string, endTime?: string) {
  if (!startTime || !endTime) return null;
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function exerciseTitle(record: HealthRecord) {
  const explicitTitle = record.title?.trim();
  if (explicitTitle) {
    return explicitTitle;
  }
  if (typeof record.exerciseType === "number") {
    return EXERCISE_TYPE_LABELS[record.exerciseType] ?? "Imported exercise";
  }
  return "Imported exercise";
}

function heartRateSamples(record: HealthRecord) {
  const samples = record.samples ?? [];
  const seen = new Set<string>();

  return samples
    .filter(
      (sample) =>
        typeof sample.beatsPerMinute === "number" &&
        Number.isFinite(sample.beatsPerMinute) &&
        typeof sample.time === "string",
    )
    .sort((a, b) => String(a.time).localeCompare(String(b.time)))
    .filter((sample) => {
      const key = `${sample.time}:${sample.beatsPerMinute}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function toMeasurementPayloads(
  recordType: HealthRecordType,
  records: HealthRecord[],
): CreateMeasurementArgs[] {
  const payloads: CreateMeasurementArgs[] = [];

  for (const record of records) {
    if (recordType === "BloodPressure") {
      const measuredAt = record.time;
      const systolic = pressureValue(record.systolic);
      const diastolic = pressureValue(record.diastolic);
      if (!measuredAt || !systolic || !diastolic) continue;
      payloads.push({
        ...provenance(recordType, record, measuredAt),
        diastolicMmHg: Math.round(diastolic),
        kind: "blood_pressure",
        measuredAt,
        systolicMmHg: Math.round(systolic),
      });
      continue;
    }

    if (recordType === "HeartRate") {
      for (const sample of heartRateSamples(record)) {
        if (!sample.time || !sample.beatsPerMinute) continue;
        payloads.push({
          ...provenance(recordType, record, sample.time, sample.time),
          bpm: Math.round(sample.beatsPerMinute),
          kind: "heart_rate",
          measuredAt: sample.time,
        });
      }
      continue;
    }

    if (recordType === "RestingHeartRate") {
      if (!record.time || !record.beatsPerMinute) continue;
      payloads.push({
        ...provenance(recordType, record, record.time),
        bpm: Math.round(record.beatsPerMinute),
        kind: "heart_rate",
        measuredAt: record.time,
      });
      continue;
    }

    if (recordType === "SleepSession") {
      const durationMin = durationMinutes(record.startTime, record.endTime);
      if (!record.startTime || !record.endTime || !durationMin) continue;
      payloads.push({
        ...provenance(recordType, record, record.endTime),
        durationMin,
        kind: "sleep",
        measuredAt: record.endTime,
        sleepFromAt: record.startTime,
        sleepToAt: record.endTime,
      });
      continue;
    }

    const durationMin = durationMinutes(record.startTime, record.endTime);
    if (!record.startTime || !record.endTime || !durationMin) continue;
    payloads.push({
      ...provenance(recordType, record, record.endTime),
      caloriesKcal: Math.max(0, Math.round(record.caloriesKcal ?? 0)),
      category: "health_connect",
      durationMin,
      exerciseId: `health_connect_${record.exerciseType ?? "exercise"}`,
      exerciseTitle: exerciseTitle(record),
      intensity: "moderate",
      kind: "exercise",
      measuredAt: record.endTime,
      met: 1,
    });
  }

  return payloads;
}

async function readRecentRecords(
  healthConnect: typeof import("react-native-health-connect"),
  recordType: HealthRecordType,
  timeRange: {
    endTime: string;
    startTime: string;
  },
) {
  let pageToken: string | undefined;
  const records: HealthRecord[] = [];

  do {
    const result = await healthConnect.readRecords(recordType, {
      ascendingOrder: true,
      pageSize: 100,
      pageToken,
      timeRangeFilter: {
        endTime: timeRange.endTime,
        operator: "between",
        startTime: timeRange.startTime,
      },
    });
    records.push(...(result.records as HealthRecord[]));
    pageToken = result.pageToken;
  } while (pageToken);

  return records;
}

export async function hasHealthConnectBackgroundReadPermission() {
  if (Platform.OS !== "android") {
    return false;
  }

  try {
    const healthConnect = await import("react-native-health-connect");
    const initialized = await healthConnect.initialize();
    if (!initialized) {
      return false;
    }

    const grantedPermissions = await healthConnect.getGrantedPermissions();
    return grantedPermissions.some(
      (permission) =>
        permission.accessType ===
          ANDROID_HEALTH_BACKGROUND_READ_PERMISSION.accessType &&
        permission.recordType ===
          ANDROID_HEALTH_BACKGROUND_READ_PERMISSION.recordType,
    );
  } catch {
    return false;
  }
}

export async function syncTodayStepMeasurement(
  reason: "active" | "background-task" | "background" | "interval" | "mount",
  options: { force?: boolean } = {},
) {
  if (Platform.OS !== "android") {
    return;
  }

  const result = await loadAndroidStepState();
  if (result.status !== "ready" || typeof result.stepsToday !== "number") {
    return;
  }

  const now = new Date();
  const slotKey = stepSyncSlotKey(now);
  if (
    !options.force &&
    (lastSyncedStepSlotKey === slotKey || inFlightStepSlotKey === slotKey)
  ) {
    return;
  }

  const roundedSteps = Math.round(result.stepsToday);
  const dateKey = localDateKey(now);
  const externalRecordId = `health-connect:steps:${dateKey}`;
  const provider = resolvedStepProvider(
    result.selectedDataOrigin,
    result.dataOrigins,
  );
  inFlightStepSlotKey = slotKey;

  try {
    await createMeasurementDirect({
      averageSpeedKph: result.summary?.averageSpeedKph ?? undefined,
      caloriesKcal: result.summary?.caloriesKcal ?? undefined,
      count: roundedSteps,
      distanceMeters: result.summary?.distanceMeters ?? undefined,
      externalRecordId,
      kind: "steps",
      measuredAt: now.toISOString(),
      provider,
      source: "provider",
    });
    invalidateMeasurementCaches("steps");
    lastSyncedStepSlotKey = slotKey;
  } catch (error) {
    console.log("Step sync failed", {
      error,
      reason,
    });
  } finally {
    if (inFlightStepSlotKey === slotKey) {
      inFlightStepSlotKey = null;
    }
  }
}

export async function syncRecentHealthConnectMeasurements(
  reason: "active" | "background-task" | "interval" | "mount",
  options: { force?: boolean } = {},
) {
  if (Platform.OS !== "android") return;

  if (reason === "background-task") {
    const canReadInBackground = await hasHealthConnectBackgroundReadPermission();
    if (!canReadInBackground) {
      return;
    }
  }

  const now = Date.now();
  if (
    !options.force &&
    (healthConnectSyncPromise ||
      now - lastHealthConnectSyncStartedAt < MIN_BACKGROUND_SYNC_INTERVAL_MS)
  ) {
    return healthConnectSyncPromise;
  }

  lastHealthConnectSyncStartedAt = now;
  healthConnectSyncPromise = (async () => {
    let uploads = 0;
    let changedKinds = new Set<CreateMeasurementArgs["kind"]>();
    const latestSyncedAtByType: Partial<Record<SyncStateRecordType, string>> = {};

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

      for (const permission of ANDROID_HEALTH_RECORD_PERMISSIONS) {
        if (
          !granted.has(`${permission.accessType}:${permission.recordType}`) ||
          uploads >= MAX_UPLOADS_PER_SYNC
        ) {
          continue;
        }

        const recordType = permission.recordType as HealthRecordType;

        try {
          const syncWindow = healthConnectSyncWindow(syncState, recordType);
          const records = await readRecentRecords(
            healthConnect,
            recordType,
            syncWindow,
          );
          const payloads = toMeasurementPayloads(recordType, records).sort((a, b) =>
            String(b.measuredAt ?? "").localeCompare(String(a.measuredAt ?? "")),
          );

          for (const payload of payloads) {
            if (!payload.externalRecordId || uploads >= MAX_UPLOADS_PER_SYNC) {
              continue;
            }

            const syncKey = `${payload.externalRecordId}:${payload.measuredAt}`;
            const retryAfter = failedMeasurementRetryAt.get(syncKey) ?? 0;

            if (syncedMeasurementKeys.has(syncKey) || retryAfter > Date.now()) {
              continue;
            }

            try {
              await createMeasurementDirect(payload);
              syncedMeasurementKeys.add(syncKey);
              failedMeasurementRetryAt.delete(syncKey);
              changedKinds.add(payload.kind);
              const syncType = syncStateRecordType(recordType);
              if (
                payload.measuredAt &&
                (!latestSyncedAtByType[syncType] ||
                  payload.measuredAt.localeCompare(latestSyncedAtByType[syncType]!) > 0)
              ) {
                latestSyncedAtByType[syncType] = payload.measuredAt;
              }
              uploads += 1;
            } catch (error) {
              failedMeasurementRetryAt.set(
                syncKey,
                Date.now() + FAILED_SYNC_RETRY_MS,
              );
              console.log("Health Connect record sync failed", {
                error,
                externalRecordId: payload.externalRecordId,
                kind: payload.kind,
                measuredAt: payload.measuredAt,
                reason,
              });
            }
          }
        } catch (error) {
          console.log("Health Connect record read failed", {
            error,
            recordType,
          });
        }
      }
    } catch (error) {
      console.log("Health Connect sync failed", error);
    } finally {
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
      healthConnectSyncPromise = null;
    }
  })();

  return healthConnectSyncPromise;
}
