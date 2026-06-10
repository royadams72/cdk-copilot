import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

import {
  type StepActivitySummary,
  type StepDebug,
  type StepStatus,
} from "@/lib/healthConnectStepSummary";
import {
  loadCurrentStepAccessState,
  openCurrentHealthAccessSettings,
  requestCurrentBackgroundStepAccess,
  requestCurrentStepAccess,
  watchCurrentStepAccess,
} from "@/lib/currentStepAccess";

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function useStepCount(goal = 10000) {
  const [status, setStatus] = useState<StepStatus>("idle");
  const [stepsToday, setStepsToday] = useState<number | null>(null);
  const [canRequestPermission, setCanRequestPermission] = useState(false);
  const [dataOrigins, setDataOrigins] = useState<string[]>([]);
  const [hasAnyMeasurementAccess, setHasAnyMeasurementAccess] = useState(false);
  const [missingHealthPermissions, setMissingHealthPermissions] = useState<
    string[]
  >([]);
  const [summary, setSummary] = useState<StepActivitySummary | null>(null);
  const [selectedDataOrigin, setSelectedDataOrigin] = useState<string | null>(
    null,
  );
  const [debug, setDebug] = useState<StepDebug | null>(null);
  const [backgroundReadGranted, setBackgroundReadGranted] = useState(false);
  const isRequestingPermissionRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    let interval: ReturnType<typeof setInterval> | null = null;
    let watchSubscription: { stop: () => void } | null = null;
    let appStateSubscription: { remove: () => void } | null = null;

    const applyStepState = async (options: { forceRefresh?: boolean } = {}) => {
      const result = await loadCurrentStepAccessState(options);
      if (!mounted) return;
      setCanRequestPermission(result.canRequestPermission);
      setDataOrigins(result.dataOrigins);
      setDebug(result.debug);
      setHasAnyMeasurementAccess(result.hasAnyMeasurementAccess);
      setMissingHealthPermissions(result.missingHealthPermissions);
      setSelectedDataOrigin(result.selectedDataOrigin);
      setSummary(result.summary);
      setStatus(result.status);
      setStepsToday(result.stepsToday);
      setBackgroundReadGranted(result.backgroundReadGranted);
    };

    const load = async () => {
      try {
        await applyStepState();
        if (!interval) {
          interval = setInterval(() => {
            void applyStepState();
          }, 60_000);
        }

        watchSubscription = await watchCurrentStepAccess(() => {
          void applyStepState({ forceRefresh: true });
        });
      } catch (error) {
        console.log("Step access load failed", {
          error: toErrorMessage(error),
        });
        if (mounted) {
          setCanRequestPermission(false);
          setDataOrigins([]);
          setDebug(null);
          setHasAnyMeasurementAccess(false);
          setMissingHealthPermissions([]);
          setSelectedDataOrigin(null);
          setSummary(null);
          setStatus("error");
        }
      }
    };

    void load();

    appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && !isRequestingPermissionRef.current) {
        void load();
      }
    });

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
      appStateSubscription?.remove();
      watchSubscription?.stop();
    };
  }, []);

  const requestAccess = async () => {
    if (!canRequestPermission) return;
    if (isRequestingPermissionRef.current) return;
    isRequestingPermissionRef.current = true;

    try {
      const result = await requestCurrentStepAccess();
      setCanRequestPermission(result.canRequestPermission);
      setDataOrigins(result.dataOrigins);
      setDebug(result.debug);
      setHasAnyMeasurementAccess(result.hasAnyMeasurementAccess);
      setMissingHealthPermissions(result.missingHealthPermissions);
      setSelectedDataOrigin(result.selectedDataOrigin);
      setSummary(result.summary);
      setStatus(result.status);
      setStepsToday(result.stepsToday);
      setBackgroundReadGranted(result.backgroundReadGranted);
    } catch (error) {
      console.log("Health Connect permission request failed", {
        error: toErrorMessage(error),
      });
      setStatus("error");
    } finally {
      isRequestingPermissionRef.current = false;
    }
  };

  const requestBackgroundReadAccess = async () => {
    if (isRequestingPermissionRef.current) return;
    isRequestingPermissionRef.current = true;

    try {
      const result = await requestCurrentBackgroundStepAccess();
      if (!result) {
        return;
      }
      setCanRequestPermission(result.canRequestPermission);
      setDataOrigins(result.dataOrigins);
      setDebug(result.debug);
      setHasAnyMeasurementAccess(result.hasAnyMeasurementAccess);
      setMissingHealthPermissions(result.missingHealthPermissions);
      setSelectedDataOrigin(result.selectedDataOrigin);
      setSummary(result.summary);
      setStatus(result.status);
      setStepsToday(result.stepsToday);
      setBackgroundReadGranted(result.backgroundReadGranted);
    } catch (error) {
      console.log("Health Connect background read permission request failed", {
        error: toErrorMessage(error),
      });
    } finally {
      isRequestingPermissionRef.current = false;
    }
  };

  const percentOfGoal = useMemo(() => {
    if (stepsToday === null || goal <= 0) return null;
    return Math.min(1, stepsToday / goal);
  }, [goal, stepsToday]);

  return {
    backgroundReadGranted,
    dataOrigins,
    debug,
    goal,
    hasAnyMeasurementAccess,
    missingHealthPermissions,
    percentOfGoal,
    openHealthAccessSettings: openCurrentHealthAccessSettings,
    requestAccess,
    requestBackgroundReadAccess,
    selectedDataOrigin,
    stepSummary: summary,
    status,
    stepsToday,
  };
}
