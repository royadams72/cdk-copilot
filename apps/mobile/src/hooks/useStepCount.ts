import { useEffect, useMemo, useState } from "react";
import { AppState, Platform } from "react-native";

import {
  ANDROID_HEALTH_BACKGROUND_READ_PERMISSION,
  ANDROID_HEALTH_PERMISSIONS,
  ANDROID_STEP_PERMISSION,
} from "@/lib/healthConnectPermissions";
import {
  loadAndroidStepState,
  type StepActivitySummary,
  type StepDebug,
  type StepStatus,
} from "@/lib/healthConnectStepSummary";

function permissionKey(permission: { accessType: string; recordType: string }) {
  return `${permission.accessType}:${permission.recordType}`;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function useStepCount(goal = 10000) {
  const [status, setStatus] = useState<StepStatus>("idle");
  const [stepsToday, setStepsToday] = useState<number | null>(null);
  const [canRequestPermission, setCanRequestPermission] = useState(false);
  const [dataOrigins, setDataOrigins] = useState<string[]>([]);
  const [missingHealthPermissions, setMissingHealthPermissions] = useState<
    string[]
  >([]);
  const [summary, setSummary] = useState<StepActivitySummary | null>(null);
  const [selectedDataOrigin, setSelectedDataOrigin] = useState<string | null>(
    null,
  );
  const [debug, setDebug] = useState<StepDebug | null>(null);
  const [backgroundReadGranted, setBackgroundReadGranted] = useState(false);

  useEffect(() => {
    let mounted = true;
    let interval: ReturnType<typeof setInterval> | null = null;
    let watchSubscription: { remove: () => void } | null = null;
    let appStateSubscription: { remove: () => void } | null = null;

    const applyAndroidState = async () => {
      const result = await loadAndroidStepState();
      if (!mounted) return;
      setCanRequestPermission(result.canRequestPermission);
      setDataOrigins(result.dataOrigins);
      setDebug(result.debug);
      setMissingHealthPermissions(result.missingHealthPermissions);
      setSelectedDataOrigin(result.selectedDataOrigin);
      setSummary(result.summary);
      setStatus(result.status);
      setStepsToday(result.stepsToday);
      setBackgroundReadGranted(
        result.missingHealthPermissions.every(
          (permission) =>
            permission !==
            `${ANDROID_HEALTH_BACKGROUND_READ_PERMISSION.accessType}:${ANDROID_HEALTH_BACKGROUND_READ_PERMISSION.recordType}`,
        ),
      );
    };

    const load = async () => {
      if (Platform.OS === "web") {
        if (mounted) setStatus("unsupported");
        return;
      }

      if (Platform.OS === "android") {
        try {
          await applyAndroidState();
          if (!interval) {
            interval = setInterval(() => {
              void applyAndroidState();
            }, 60_000);
          }
        } catch (error) {
          console.log("Health Connect step load failed", {
            error: toErrorMessage(error),
          });
          if (mounted) {
            setCanRequestPermission(false);
            setDataOrigins([]);
            setDebug(null);
            setMissingHealthPermissions([]);
            setSelectedDataOrigin(null);
            setSummary(null);
            setStatus("error");
          }
        }
        return;
      }

      try {
        const { Pedometer } = await import("expo-sensors");
        const available = await Pedometer.isAvailableAsync();
        if (!available) {
          if (mounted) setStatus("unsupported");
          return;
        }

        const currentPermissions = Pedometer.getPermissionsAsync
          ? await Pedometer.getPermissionsAsync()
          : null;

        let granted =
          typeof currentPermissions?.granted === "boolean"
            ? currentPermissions.granted
            : true;

        if (!granted && Pedometer.requestPermissionsAsync) {
          const requested = await Pedometer.requestPermissionsAsync();
          granted = !!requested.granted;
        }

        if (!granted) {
          if (mounted) setStatus("permission-denied");
          return;
        }

        const refreshTodaySteps = async () => {
          const startOfDay = new Date();
          startOfDay.setHours(0, 0, 0, 0);
          const now = new Date();
          const result = await Pedometer.getStepCountAsync(startOfDay, now);
          if (!mounted) return;
          setStepsToday(result.steps ?? 0);
          setSelectedDataOrigin("expo-sensors.pedometer");
          setStatus("ready");
        };

        await refreshTodaySteps();

        watchSubscription = Pedometer.watchStepCount(() => {
          void refreshTodaySteps();
        });

        interval = setInterval(() => {
          void refreshTodaySteps();
        }, 60_000);
      } catch (error) {
        console.log("iOS pedometer step load failed", {
          error: toErrorMessage(error),
        });
        if (mounted) setStatus("error");
      }
    };

    void load();

    appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void load();
      }
    });

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
      appStateSubscription?.remove();
      watchSubscription?.remove();
    };
  }, []);

  const requestAccess = async () => {
    if (Platform.OS !== "android" || !canRequestPermission) return;

    try {
      const healthConnect = await import("react-native-health-connect");
      console.log("Health Connect permissions requested", {
        requested: ANDROID_HEALTH_PERMISSIONS.map(permissionKey),
      });
      const grantedPermissions = await healthConnect.requestPermission([
        ...ANDROID_HEALTH_PERMISSIONS,
      ]);
      console.log("Health Connect permission request result", {
        granted: grantedPermissions.map(permissionKey),
      });
      const hasStepAccess = grantedPermissions.some(
        (permission) =>
          permission.accessType === ANDROID_STEP_PERMISSION.accessType &&
          permission.recordType === ANDROID_STEP_PERMISSION.recordType,
      );

      if (!hasStepAccess) {
        setStatus("permission-denied");
        return;
      }

      const result = await loadAndroidStepState();
      setCanRequestPermission(result.canRequestPermission);
      setDataOrigins(result.dataOrigins);
      setDebug(result.debug);
      setMissingHealthPermissions(result.missingHealthPermissions);
      setSelectedDataOrigin(result.selectedDataOrigin);
      setSummary(result.summary);
      setStatus(result.status);
      setStepsToday(result.stepsToday);
      setBackgroundReadGranted(
        grantedPermissions.some(
          (permission) =>
            permission.accessType ===
              ANDROID_HEALTH_BACKGROUND_READ_PERMISSION.accessType &&
            permission.recordType ===
              ANDROID_HEALTH_BACKGROUND_READ_PERMISSION.recordType,
        ),
      );
    } catch (error) {
      console.log("Health Connect permission request failed", {
        error: toErrorMessage(error),
      });
      setStatus("error");
    }
  };

  const requestBackgroundReadAccess = async () => {
    if (Platform.OS !== "android") return;

    try {
      const healthConnect = await import("react-native-health-connect");
      const grantedPermissions = await healthConnect.requestPermission([
        ANDROID_HEALTH_BACKGROUND_READ_PERMISSION,
      ]);
      setBackgroundReadGranted(
        grantedPermissions.some(
          (permission) =>
            permission.accessType ===
              ANDROID_HEALTH_BACKGROUND_READ_PERMISSION.accessType &&
            permission.recordType ===
              ANDROID_HEALTH_BACKGROUND_READ_PERMISSION.recordType,
        ),
      );
    } catch (error) {
      console.log("Health Connect background read permission request failed", {
        error: toErrorMessage(error),
      });
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
    missingHealthPermissions,
    percentOfGoal,
    requestAccess,
    requestBackgroundReadAccess,
    selectedDataOrigin,
    stepSummary: summary,
    status,
    stepsToday,
  };
}
