import { useEffect } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";

import { syncRecentHealthConnectMeasurements } from "@/lib/healthConnectSync";

let measurementSyncConsumers = 0;
let measurementSyncInterval: ReturnType<typeof setInterval> | null = null;
let measurementSyncAppStateSubscription: { remove: () => void } | null = null;
let lastMeasurementSyncAppState: AppStateStatus = AppState.currentState;

function startMeasurementSyncLoop() {
  if (measurementSyncInterval || measurementSyncAppStateSubscription) {
    return;
  }

  void syncRecentHealthConnectMeasurements("mount");

  measurementSyncInterval = setInterval(() => {
    void syncRecentHealthConnectMeasurements("interval");
  }, 5 * 60_000);

  measurementSyncAppStateSubscription = AppState.addEventListener("change", (state) => {
    const previousState = lastMeasurementSyncAppState;
    lastMeasurementSyncAppState = state;

    if (state === "active" && previousState !== "active") {
      void syncRecentHealthConnectMeasurements("active");
    }
  });
}

function stopMeasurementSyncLoop() {
  if (measurementSyncConsumers > 0) {
    return;
  }

  if (measurementSyncInterval) {
    clearInterval(measurementSyncInterval);
    measurementSyncInterval = null;
  }

  measurementSyncAppStateSubscription?.remove();
  measurementSyncAppStateSubscription = null;
}

export function useSyncHealthConnectMeasurements(enabled: boolean) {
  useEffect(() => {
    if (!enabled || Platform.OS !== "android") return;

    measurementSyncConsumers += 1;
    startMeasurementSyncLoop();

    return () => {
      measurementSyncConsumers = Math.max(0, measurementSyncConsumers - 1);
      stopMeasurementSyncLoop();
    };
  }, [enabled]);
}
