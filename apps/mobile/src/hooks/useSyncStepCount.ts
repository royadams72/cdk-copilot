import { useEffect } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";

import { getCurrentHealthSyncProvider } from "@/lib/currentHealthSyncProvider";
import { flushHealthConnectEventLogs } from "@/lib/healthConnectEventLogger";

let stepSyncConsumers = 0;
let stepSyncInterval: ReturnType<typeof setInterval> | null = null;
let stepSyncAppStateSubscription: { remove: () => void } | null = null;
let lastStepSyncAppState: AppStateStatus = AppState.currentState;

function startStepSyncLoop() {
  if (stepSyncInterval || stepSyncAppStateSubscription) {
    return;
  }

  const provider = getCurrentHealthSyncProvider();
  if (!provider) {
    return;
  }

  void flushHealthConnectEventLogs();
  void provider.syncTodaySteps("mount");

  stepSyncInterval = setInterval(() => {
    void provider.syncTodaySteps("interval");
  }, 5 * 60_000);

  stepSyncAppStateSubscription = AppState.addEventListener("change", (state) => {
    const previousState = lastStepSyncAppState;
    lastStepSyncAppState = state;

    if (state === "active" && previousState !== "active") {
      void flushHealthConnectEventLogs();
      void provider.syncTodaySteps("active");
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

export function forceStopStepSyncLoop() {
  stepSyncConsumers = 0;
  stopStepSyncLoop();
}

export function useSyncStepCount(
  _stepsToday: number | null,
  isReady: boolean,
) {
  useEffect(() => {
    if (Platform.OS === "web" || !isReady) {
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
