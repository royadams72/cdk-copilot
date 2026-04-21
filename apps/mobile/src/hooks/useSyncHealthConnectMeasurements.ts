import { useEffect } from "react";
import { AppState, Platform } from "react-native";

import { syncRecentHealthConnectMeasurements } from "@/lib/healthConnectSync";

export function useSyncHealthConnectMeasurements(enabled: boolean) {
  useEffect(() => {
    if (!enabled || Platform.OS !== "android") return;

    void syncRecentHealthConnectMeasurements("mount");

    const interval = setInterval(() => {
      void syncRecentHealthConnectMeasurements("interval");
    }, 5 * 60_000);

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void syncRecentHealthConnectMeasurements("active");
      }
    });

    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [enabled]);
}
