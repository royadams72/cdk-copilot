import { useEffect, useMemo, useState } from "react";
import { AppState, Platform } from "react-native";

type StepStatus =
  | "idle"
  | "unsupported"
  | "permission-required"
  | "permission-denied"
  | "health-connect-unavailable"
  | "health-connect-update-required"
  | "ready"
  | "error";

const ANDROID_STEP_PERMISSION = {
  accessType: "read",
  recordType: "Steps",
} as const;

type StepDebug = {
  aggregateTotal: number;
  groupedError: boolean;
  groupedTotal: number | null;
  originTotals: Record<string, number>;
};

async function readStepTotalsByOrigin(
  healthConnect: typeof import("react-native-health-connect"),
  timeRangeFilter: {
    endTime: string;
    operator: "between";
    startTime: string;
  },
) {
  let pageToken: string | undefined;
  const originTotals: Record<string, number> = {};

  do {
    const result = await healthConnect.readRecords("Steps", {
      ascendingOrder: true,
      pageSize: 1000,
      pageToken,
      timeRangeFilter,
    });

    for (const record of result.records) {
      const origin = record.metadata?.dataOrigin ?? "unknown";
      originTotals[origin] =
        (originTotals[origin] ?? 0) + Math.max(0, Math.round(record.count ?? 0));
    }

    pageToken = result.pageToken;
  } while (pageToken);

  return originTotals;
}

function selectStepTotalFromOrigins(
  aggregateTotal: number,
  originTotals: Record<string, number>,
) {
  const highestOriginTotal = Math.max(0, ...Object.values(originTotals));
  return Math.max(aggregateTotal, highestOriginTotal);
}

async function loadAndroidStepState() {
  const healthConnect = await import("react-native-health-connect");
  const sdkStatus = await healthConnect.getSdkStatus();

  if (
    sdkStatus === healthConnect.SdkAvailabilityStatus.SDK_UNAVAILABLE
  ) {
    return {
      canRequestPermission: false,
      dataOrigins: [],
      debug: null as StepDebug | null,
      status: "health-connect-unavailable" as const,
      stepsToday: null,
    };
  }

  if (
    sdkStatus ===
    healthConnect.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
  ) {
    return {
      canRequestPermission: false,
      dataOrigins: [],
      debug: null as StepDebug | null,
      status: "health-connect-update-required" as const,
      stepsToday: null,
    };
  }

  const initialized = await healthConnect.initialize();
  if (!initialized) {
    return {
      canRequestPermission: false,
      dataOrigins: [],
      debug: null as StepDebug | null,
      status: "error" as const,
      stepsToday: null,
    };
  }

  const grantedPermissions = await healthConnect.getGrantedPermissions();
  const hasStepAccess = grantedPermissions.some(
    (permission) =>
      permission.accessType === ANDROID_STEP_PERMISSION.accessType &&
      permission.recordType === ANDROID_STEP_PERMISSION.recordType,
  );

  if (!hasStepAccess) {
    return {
      canRequestPermission: true,
      dataOrigins: [],
      debug: null as StepDebug | null,
      status: "permission-required" as const,
      stepsToday: null,
    };
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const timeRangeFilter = {
    operator: "between" as const,
    startTime: startOfDay.toISOString(),
    endTime: new Date().toISOString(),
  };

  const aggregate = await healthConnect.aggregateRecord({
    recordType: "Steps",
    timeRangeFilter,
  });
  const aggregateTotal = Math.max(0, Math.round(aggregate.COUNT_TOTAL ?? 0));
  const originTotals = await readStepTotalsByOrigin(
    healthConnect,
    timeRangeFilter,
  );
  let groupedTotal: number | null = null;
  let groupedError = false;

  try {
    const dailyAggregate = await healthConnect.aggregateGroupByPeriod({
      recordType: "Steps",
      timeRangeFilter,
      timeRangeSlicer: {
        length: 1,
        period: "DAYS",
      },
    });
    groupedTotal = dailyAggregate.reduce(
      (total, group) =>
        total + Math.max(0, Math.round(group.result.COUNT_TOTAL ?? 0)),
      0,
    );
  } catch {
    groupedError = true;
  }

  return {
    canRequestPermission: true,
    dataOrigins:
      Object.keys(originTotals).length > 0
        ? Object.keys(originTotals)
        : aggregate.dataOrigins ?? [],
    debug: {
      aggregateTotal,
      groupedError,
      groupedTotal,
      originTotals,
    },
    status: "ready" as const,
    stepsToday:
      typeof groupedTotal === "number"
        ? Math.max(
            selectStepTotalFromOrigins(aggregateTotal, originTotals),
            groupedTotal,
          )
        : selectStepTotalFromOrigins(aggregateTotal, originTotals),
  };
}

export function useStepCount(goal = 10000) {
  const [status, setStatus] = useState<StepStatus>("idle");
  const [stepsToday, setStepsToday] = useState<number | null>(null);
  const [canRequestPermission, setCanRequestPermission] = useState(false);
  const [dataOrigins, setDataOrigins] = useState<string[]>([]);
  const [debug, setDebug] = useState<{
    aggregateTotal: number;
    groupedError: boolean;
    groupedTotal: number | null;
    originTotals: Record<string, number>;
  } | null>(null);

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
      setStatus(result.status);
      setStepsToday(result.stepsToday);
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
        } catch {
          if (mounted) {
            setCanRequestPermission(false);
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
          setStatus("ready");
        };

        await refreshTodaySteps();

        watchSubscription = Pedometer.watchStepCount(() => {
          void refreshTodaySteps();
        });

        interval = setInterval(() => {
          void refreshTodaySteps();
        }, 60_000);
      } catch {
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
      const grantedPermissions = await healthConnect.requestPermission([
        ANDROID_STEP_PERMISSION,
      ]);
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
      setStatus(result.status);
      setStepsToday(result.stepsToday);
    } catch {
      setStatus("error");
    }
  };

  const percentOfGoal = useMemo(() => {
    if (stepsToday === null || goal <= 0) return null;
    return Math.min(1, stepsToday / goal);
  }, [goal, stepsToday]);

  return {
    goal,
    dataOrigins,
    debug,
    percentOfGoal,
    requestAccess,
    status,
    stepsToday,
  };
}
