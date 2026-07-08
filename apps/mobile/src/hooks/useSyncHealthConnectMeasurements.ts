import { useEffect } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";

import { getCurrentHealthSyncProvider } from "@/lib/currentHealthSyncProvider";

let measurementSyncConsumers = 0;
let measurementSyncInterval: ReturnType<typeof setInterval> | null = null;
let measurementSyncAppStateSubscription: { remove: () => void } | null = null;
let lastMeasurementSyncAppState: AppStateStatus = AppState.currentState;

function startMeasurementSyncLoop() {
  if (measurementSyncInterval || measurementSyncAppStateSubscription) {
    return;
  }

  const provider = getCurrentHealthSyncProvider();
  if (!provider) {
    return;
  }

  void provider.syncRecentMeasurements("mount");

  measurementSyncInterval = setInterval(() => {
    void provider.syncRecentMeasurements("interval");
  }, 5 * 60_000);

  measurementSyncAppStateSubscription = AppState.addEventListener("change", (state) => {
    const previousState = lastMeasurementSyncAppState;
    lastMeasurementSyncAppState = state;

    if (state === "active" && previousState !== "active") {
      void provider.syncRecentMeasurements("active");
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

export function forceStopMeasurementSyncLoop() {
  measurementSyncConsumers = 0;
  stopMeasurementSyncLoop();
}

export function useSyncHealthConnectMeasurements(enabled: boolean) {
  useEffect(() => {
    if (!enabled || Platform.OS === "web") return;

    measurementSyncConsumers += 1;
    startMeasurementSyncLoop();

    return () => {
      measurementSyncConsumers = Math.max(0, measurementSyncConsumers - 1);
      stopMeasurementSyncLoop();
    };
  }, [enabled]);
}
