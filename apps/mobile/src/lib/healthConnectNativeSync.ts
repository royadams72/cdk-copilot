import { NativeModules, Platform } from "react-native";

import { logHealthConnectEvent } from "@/lib/healthConnectEventLogger";
import {
  syncRecentHealthConnectMeasurements,
  syncTodayStepMeasurement,
} from "@/lib/healthConnectSync";

export const HEALTH_CONNECT_BACKGROUND_SYNC_TASK_KEY =
  "HealthConnectBackgroundSyncTask";

type NativeHealthConnectBackgroundSyncStatus = {
  bridgeReady: boolean;
  nativeWorkerEnabled: boolean;
  platform: "android";
  strategy: "work-manager-headless-js";
  taskKey: string;
  uniquePeriodicWorkName: string;
};

type HealthConnectBackgroundSyncModuleShape = {
  cancelScheduled: () => Promise<NativeHealthConnectBackgroundSyncStatus>;
  ensureScheduled: () => Promise<NativeHealthConnectBackgroundSyncStatus>;
  getStatus: () => Promise<NativeHealthConnectBackgroundSyncStatus>;
  triggerNow: () => Promise<NativeHealthConnectBackgroundSyncStatus>;
};

const nativeModule = NativeModules.HealthConnectBackgroundSync as
  | HealthConnectBackgroundSyncModuleShape
  | undefined;

export async function getNativeHealthConnectBackgroundSyncStatus() {
  if (Platform.OS !== "android" || !nativeModule?.getStatus) {
    return null;
  }

  return nativeModule.getStatus();
}

export async function ensureNativeHealthConnectBackgroundSyncScheduled() {
  if (Platform.OS !== "android" || !nativeModule?.ensureScheduled) {
    return null;
  }

  return nativeModule.ensureScheduled();
}

export async function triggerNativeHealthConnectBackgroundSyncNow() {
  if (Platform.OS !== "android" || !nativeModule?.triggerNow) {
    return null;
  }

  return nativeModule.triggerNow();
}

export async function cancelNativeHealthConnectBackgroundSync() {
  if (Platform.OS !== "android" || !nativeModule?.cancelScheduled) {
    return null;
  }

  return nativeModule.cancelScheduled();
}

export async function runNativeHealthConnectBackgroundSyncTask(
  data?: Record<string, unknown>,
) {
  const reason =
    typeof data?.reason === "string" ? data.reason : "background-task";
  const force = data?.force !== false;

  await logHealthConnectEvent({
    event: "native-background-sync-task-start",
    payload: {
      force,
      reason,
    },
    source: "background-task",
    status: "info",
    trigger: reason,
  });

  try {
    await syncTodayStepMeasurement("background-task", { force });
    await syncRecentHealthConnectMeasurements("background-task", { force });
    await logHealthConnectEvent({
      event: "native-background-sync-task-success",
      payload: {
        force,
        reason,
      },
      source: "background-task",
      status: "info",
      trigger: reason,
    });
  } catch (error) {
    await logHealthConnectEvent({
      event: "native-background-sync-task-fail",
      payload: {
        error: error instanceof Error ? error.message : String(error),
        force,
        reason,
      },
      source: "background-task",
      status: "error",
      trigger: reason,
    });
    throw error;
  }
}
