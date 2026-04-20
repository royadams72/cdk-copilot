import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { syncRecentHealthConnectMeasurements, syncTodayStepMeasurement } from "@/lib/healthConnectSync";

const HEALTH_CONNECT_BACKGROUND_TASK = "health-connect-sync";

if (!TaskManager.isTaskDefined(HEALTH_CONNECT_BACKGROUND_TASK)) {
  TaskManager.defineTask(HEALTH_CONNECT_BACKGROUND_TASK, async () => {
    try {
      await syncTodayStepMeasurement("background-task", { force: true });
      await syncRecentHealthConnectMeasurements("background-task", { force: true });
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      console.log("Health Connect background task failed", error);
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
