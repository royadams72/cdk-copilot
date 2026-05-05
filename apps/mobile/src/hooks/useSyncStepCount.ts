import { useEffect } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";

import { flushHealthConnectEventLogs } from "@/lib/healthConnectEventLogger";
import { syncTodayStepMeasurement } from "@/lib/healthConnectSync";

let stepSyncConsumers = 0;
let stepSyncInterval: ReturnType<typeof setInterval> | null = null;
let stepSyncAppStateSubscription: { remove: () => void } | null = null;
let lastStepSyncAppState: AppStateStatus = AppState.currentState;

function startStepSyncLoop() {
  if (stepSyncInterval || stepSyncAppStateSubscription) {
    return;
  }

  void flushHealthConnectEventLogs();
  void syncTodayStepMeasurement("mount");

  stepSyncInterval = setInterval(() => {
    void syncTodayStepMeasurement("interval");
  }, 5 * 60_000);

  stepSyncAppStateSubscription = AppState.addEventListener("change", (state) => {
    const previousState = lastStepSyncAppState;
    lastStepSyncAppState = state;

    if (state === "active" && previousState !== "active") {
      void flushHealthConnectEventLogs();
      void syncTodayStepMeasurement("active");
    }
  });
}

function stopStepSyncLoop() {
  if (stepSyncConsumers > 0) {
    return;
  }

  if (stepSyncInterval) {
    clearInterval(stepSyncInterval);
    stepSyncInterval = null;
  }

  stepSyncAppStateSubscription?.remove();
  stepSyncAppStateSubscription = null;
}

export function useSyncStepCount(
  _stepsToday: number | null,
  isReady: boolean,
) {
  useEffect(() => {
    if (Platform.OS !== "android" || !isReady) {
      return;
    }

    stepSyncConsumers += 1;
    startStepSyncLoop();

    return () => {
      stepSyncConsumers = Math.max(0, stepSyncConsumers - 1);
      stopStepSyncLoop();
    };
  }, [isReady]);
}
