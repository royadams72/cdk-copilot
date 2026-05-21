import { NativeModules, Platform } from "react-native";

import { logHealthConnectEvent } from "@/lib/healthConnectEventLogger";
import {
  syncRecentHealthConnectMeasurements,
  syncTodayStepMeasurement,
} from "@/lib/healthConnectSync";

export const HEALTH_CONNECT_BACKGROUND_SYNC_TASK_KEY =
  "HealthConnectBackgroundSyncTask";

type NativeHealthConnectBackgroundSyncStatus = {
  activeRunId: string | null;
  bridgeReady: boolean;
  immediateWorkState: string | null;
  lastFailureReason: string | null;
  lastForegroundAt: number | null;
  lastRunId: string | null;
  lastScheduledAt: number | null;
  lastTaskFinishedAt: number | null;
  lastTaskStartedAt: number | null;
  lastTaskStatus: string | null;
  lastTriggeredAt: number | null;
  lastTriggerReason: string | null;
  lastWorkerStartedAt: number | null;
  nativeWorkerEnabled: boolean;
  platform: "android";
  periodicWorkState: string | null;
  strategy: "foreground-work-manager-native";
  taskKey: string;
  uniqueImmediateWorkName: string;
  uniquePeriodicWorkName: string;
};

type HealthConnectBackgroundSyncModuleShape = {
  cancelScheduled: () => Promise<NativeHealthConnectBackgroundSyncStatus>;
  ensureScheduled: () => Promise<NativeHealthConnectBackgroundSyncStatus>;
  getStatus: () => Promise<NativeHealthConnectBackgroundSyncStatus>;
  markTaskFinished: (
    runId: string,
    succeeded: boolean,
    errorMessage: string | null,
  ) => Promise<NativeHealthConnectBackgroundSyncStatus>;
  markTaskStarted: (
    runId: string,
    reason: string,
  ) => Promise<NativeHealthConnectBackgroundSyncStatus>;
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
  const runId = typeof data?.runId === "string" ? data.runId : `unknown-${Date.now()}`;

  await nativeModule?.markTaskStarted?.(runId, reason);

  await logHealthConnectEvent({
    event: "native-background-sync-task-start",
    payload: {
      force,
      reason,
      runId,
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
        runId,
      },
      source: "background-task",
      status: "info",
      trigger: reason,
    });
    await nativeModule?.markTaskFinished?.(runId, true, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logHealthConnectEvent({
      event: "native-background-sync-task-fail",
      payload: {
        error: message,
        force,
        reason,
        runId,
      },
      source: "background-task",
      status: "error",
      trigger: reason,
    });
    await nativeModule?.markTaskFinished?.(runId, false, message);
    throw error;
  }
}
