import { useEffect, useRef } from "react";

import type { StepActivitySummary } from "@/hooks/useStepCount";
import { useCreateMeasurementMutation } from "@/store/services/measurementsApi";

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type StepSyncOptions = {
  summary?: StepActivitySummary | null;
};

export function useSyncStepCount(
  stepsToday: number | null,
  isReady: boolean,
  options: StepSyncOptions = {},
) {
  const [createMeasurement] = useCreateMeasurementMutation();
  const lastSyncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isReady || typeof stepsToday !== "number" || stepsToday < 0) return;
    const roundedSteps = Math.round(stepsToday);
    const now = new Date();
    const dateKey = localDateKey(now);
    const externalRecordId = `health-connect:steps:${dateKey}`;
    const summary = options.summary;
    const syncKey = JSON.stringify({
      averageSpeedKph: summary?.averageSpeedKph ?? null,
      caloriesKcal: summary?.caloriesKcal ?? null,
      count: roundedSteps,
      distanceMeters: summary?.distanceMeters ?? null,
      externalRecordId,
    });
    if (lastSyncedRef.current === syncKey) return;

    void createMeasurement({
      averageSpeedKph: summary?.averageSpeedKph ?? undefined,
      caloriesKcal: summary?.caloriesKcal ?? undefined,
      count: roundedSteps,
      distanceMeters: summary?.distanceMeters ?? undefined,
      externalRecordId,
      kind: "steps",
      measuredAt: now.toISOString(),
      provider: {
        displayName: "Health Connect",
        packageName: "android.healthconnect",
      },
      source: "provider",
    })
      .unwrap()
      .then(() => {
        lastSyncedRef.current = syncKey;
      })
      .catch((error) => {
        console.log("Step sync failed", error);
      });
  }, [createMeasurement, isReady, options.summary, stepsToday]);
}
