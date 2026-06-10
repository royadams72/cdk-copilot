import { Platform } from "react-native";

import { getCurrentHealthSyncProvider } from "@/lib/currentHealthSyncProvider";
import { logHealthConnectEvent } from "@/lib/healthConnectEventLogger";
import {
  getHealthConnectNativeBackgroundModule,
  getNativeHealthConnectBackgroundSyncStatus,
  ensureNativeHealthConnectBackgroundSyncScheduled,
  triggerNativeHealthConnectBackgroundSyncNow,
  cancelNativeHealthConnectBackgroundSync,
} from "@/lib/healthConnectNativeBridge";

export {
  getNativeHealthConnectBackgroundSyncStatus,
  ensureNativeHealthConnectBackgroundSyncScheduled,
  triggerNativeHealthConnectBackgroundSyncNow,
  cancelNativeHealthConnectBackgroundSync,
} from "@/lib/healthConnectNativeBridge";

export const HEALTH_CONNECT_BACKGROUND_SYNC_TASK_KEY =
  "HealthConnectBackgroundSyncTask";

export async function runNativeHealthConnectBackgroundSyncTask(
  data?: Record<string, unknown>,
) {
  const nativeModule = getHealthConnectNativeBackgroundModule();
  const provider = getCurrentHealthSyncProvider();
  if (!provider) {
    return;
  }

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
    await provider.syncTodaySteps("background-task", { force });
    await provider.syncRecentMeasurements("background-task", { force });
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
