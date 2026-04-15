import { useEffect, useRef } from "react";

import { useCreateMeasurementMutation } from "@/store/services/dashboardApi";

export function useSyncStepCount(stepsToday: number | null, isReady: boolean) {
  const [createMeasurement] = useCreateMeasurementMutation();
  const lastSyncedRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isReady || typeof stepsToday !== "number" || stepsToday < 0) return;
    const roundedSteps = Math.round(stepsToday);
    if (lastSyncedRef.current === roundedSteps) return;

    lastSyncedRef.current = roundedSteps;
    void createMeasurement({
      count: roundedSteps,
      kind: "steps",
      measuredAt: new Date().toISOString(),
    });
  }, [createMeasurement, isReady, stepsToday]);
}
