import { useEffect, useRef } from "react";

import { useCreateMeasurementMutation } from "@/store/services/dashboardApi";

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayNameFromPackageName(packageName: string) {
  return packageName.split(".").filter(Boolean).at(-1) ?? packageName;
}

type StepSyncOptions = {
  providerPackageName?: string | null;
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
    const packageName =
      options.providerPackageName?.trim() || "android.healthconnect.aggregate";
    const externalRecordId = `health-connect:${packageName}:steps:${dateKey}`;
    const syncKey = `${externalRecordId}:${roundedSteps}`;
    if (lastSyncedRef.current === syncKey) return;

    void createMeasurement({
      count: roundedSteps,
      externalRecordId,
      kind: "steps",
      measuredAt: now.toISOString(),
      provider: {
        displayName: displayNameFromPackageName(packageName),
        packageName,
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
  }, [createMeasurement, isReady, options.providerPackageName, stepsToday]);
}
