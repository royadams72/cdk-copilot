import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { logHealthConnectEvent } from "@/lib/healthConnectEventLogger";
import {
  syncRecentHealthConnectMeasurements,
  syncTodayStepMeasurement,
} from "@/lib/healthConnectSync";

const HEALTH_CONNECT_BACKGROUND_TASK = "health-connect-sync";

async function runHealthConnectBackgroundTaskAsync() {
  await logHealthConnectEvent({
    event: "background-task-start",
    source: "background-task",
    status: "info",
  });
  await syncTodayStepMeasurement("background-task", { force: true });
  await syncRecentHealthConnectMeasurements("background-task", { force: true });
  await logHealthConnectEvent({
    event: "background-task-success",
    source: "background-task",
    status: "info",
  });
}

if (!TaskManager.isTaskDefined(HEALTH_CONNECT_BACKGROUND_TASK)) {
  TaskManager.defineTask(HEALTH_CONNECT_BACKGROUND_TASK, async () => {
    try {
      await runHealthConnectBackgroundTaskAsync();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      console.log("Health Connect background task failed", error);
      await logHealthConnectEvent({
        event: "background-task-fail",
        payload: {
          error: error instanceof Error ? error.message : String(error),
        },
        source: "background-task",
        status: "error",
      });
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

export async function registerHealthConnectBackgroundTaskAsync() {
  if (Platform.OS !== "android") {
    return false;
  }

  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    return false;
  }

  await BackgroundTask.registerTaskAsync(HEALTH_CONNECT_BACKGROUND_TASK, {
    minimumInterval: 15,
  });

  return true;
}

export async function triggerHealthConnectBackgroundTaskForTestingAsync() {
  if (!__DEV__ || Platform.OS !== "android") {
    return false;
  }
  await runHealthConnectBackgroundTaskAsync();
  return true;
}
