import AsyncStorage from "@react-native-async-storage/async-storage";

const FAILED_SYNC_RETRY_MS = 10 * 60_000;
const HEALTH_CONNECT_CHANGES_TOKEN_STORAGE_KEY =
  "health-connect:sync:changes-token:v1";

type StoredHealthConnectChangesState = {
  token: string;
  updatedAt: string;
};

export const syncedMeasurementKeys = new Set<string>();
export const failedMeasurementRetryAt = new Map<string, number>();

// Tracks backfill windows that have already run this app session. Cleared on app restart.
export const completedBackfillWindowKeys = new Set<string>();

export const healthConnectRuntimeState: {
  healthConnectSyncPromise: Promise<void> | null;
  inFlightBackfillWindowKeys: Set<string>;
  inFlightStepSlotKey: string | null;
  lastHealthConnectQuotaRetryAt: number;
  lastHealthConnectSyncStartedAt: number;
  lastSyncedStepSlotKey: string | null;
} = {
  healthConnectSyncPromise: null,
  inFlightBackfillWindowKeys: new Set<string>(),
  inFlightStepSlotKey: null,
  lastHealthConnectQuotaRetryAt: 0,
  lastHealthConnectSyncStartedAt: 0,
  lastSyncedStepSlotKey: null,
};

export function failedMeasurementRetryMs() {
  return FAILED_SYNC_RETRY_MS;
}

export async function loadStoredHealthConnectChangesState() {
  const raw = await AsyncStorage.getItem(HEALTH_CONNECT_CHANGES_TOKEN_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredHealthConnectChangesState;
    if (
      typeof parsed?.token === "string" &&
      parsed.token.trim().length > 0 &&
      typeof parsed?.updatedAt === "string" &&
      parsed.updatedAt.trim().length > 0
    ) {
      return parsed;
    }
  } catch {
    // Ignore corrupt state and re-bootstrap.
  }

  return null;
}

export async function saveStoredHealthConnectChangesState(token: string) {
  const value: StoredHealthConnectChangesState = {
    token,
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(
    HEALTH_CONNECT_CHANGES_TOKEN_STORAGE_KEY,
    JSON.stringify(value),
  );
}

export async function clearStoredHealthConnectChangesState() {
  await AsyncStorage.removeItem(HEALTH_CONNECT_CHANGES_TOKEN_STORAGE_KEY);
}
