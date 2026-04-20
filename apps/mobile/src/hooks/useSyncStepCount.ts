import { useEffect } from "react";
import { AppState, Platform } from "react-native";

import { syncTodayStepMeasurement } from "@/lib/healthConnectSync";

export function useSyncStepCount(
  _stepsToday: number | null,
  isReady: boolean,
) {
  useEffect(() => {
    if (Platform.OS !== "android" || !isReady) {
      return;
    }

    void syncTodayStepMeasurement("mount");

    const interval = setInterval(() => {
      void syncTodayStepMeasurement("interval");
    }, 5 * 60_000);

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void syncTodayStepMeasurement("active", { force: true });
      }
      if (state === "background") {
        void syncTodayStepMeasurement("background", { force: true });
      }
    });

    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [isReady]);
}
