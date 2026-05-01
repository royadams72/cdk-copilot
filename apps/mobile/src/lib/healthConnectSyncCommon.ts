import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { store } from "@/store";
import { measurementsApi } from "@/store/services/measurementsApi";
import type { CreateMeasurementArgs } from "@/store/services/types";
import type { HealthRecordType } from "@/lib/healthConnectSyncPipeline";

export const HEALTH_CONNECT_QUOTA_COOLDOWN_MS = 5 * 60_000;
export const MAX_UPLOADS_PER_SYNC = 100;
export const MIN_BACKGROUND_SYNC_INTERVAL_MS = 15 * 60_000;
export const FOREGROUND_SYNC_INTERVAL_MS = 5 * 60_000;
export const HEALTH_CONNECT_SYNC_OVERLAP_MS = 5 * 60_000;

export type SyncStateRecordType =
  | "blood_pressure"
  | "exercise"
  | "heart_rate"
  | "sleep"
  | "steps";

export type BackfillableMeasurementKind =
  | "blood_pressure"
  | "exercise"
  | "heart_rate"
  | "sleep"
  | "steps";

export type HealthConnectSyncStateResponse = {
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

const INITIAL_SYNC_LOOKBACK_MS: Record<SyncStateRecordType, number> = {
  blood_pressure: 3 * 24 * 60 * 60_000,
  exercise: 3 * 24 * 60 * 60_000,
  heart_rate: 24 * 60 * 60_000,
  sleep: 7 * 24 * 60 * 60_000,
  steps: 24 * 60 * 60_000,
};

export function stepSyncEventSource(
  reason: "active" | "background-task" | "background" | "interval" | "mount",
) {
  return reason === "background-task" ? "background-task" : "foreground-sync";
}

export function measurementSyncEventSource(
  reason: "active" | "background-task" | "interval" | "mount",
) {
  return reason === "background-task"
    ? "background-task"
    : "health-connect-sync";
}

export function invalidateMeasurementCaches(
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

export function syncStateRecordType(
  recordType: HealthRecordType,
): SyncStateRecordType {
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

export async function getServerHealthConnectSyncState() {
  const response = await authFetch(`${API}/api/users/health-connect/sync-state`);
  const body = (await response.json().catch(() => null)) as
    | { data?: HealthConnectSyncStateResponse; message?: string; ok?: boolean }
    | null;

  if (!response.ok || !body?.ok || !body.data) {
    throw new Error(body?.message ?? "Failed to load Health Connect sync state");
  }

  return body.data;
}

export async function updateServerHealthConnectSyncState(
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

export function healthConnectSyncWindow(
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
      : new Date(end.getTime() - INITIAL_SYNC_LOOKBACK_MS[syncType]);

  if (start.getTime() >= end.getTime()) {
    start.setTime(end.getTime() - 60_000);
  }

  return {
    endTime: end.toISOString(),
    startTime: start.toISOString(),
  };
}

