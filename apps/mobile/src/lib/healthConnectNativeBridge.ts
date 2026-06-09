import { NativeModules, Platform } from "react-native";

export type NativeHealthConnectBackgroundSyncStatus = {
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

export function getHealthConnectNativeBackgroundModule() {
  return nativeModule;
}

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
