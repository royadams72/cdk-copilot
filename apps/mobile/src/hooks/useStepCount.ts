import { useEffect, useMemo, useState } from "react";
import { AppState, Platform } from "react-native";

import {
  ANDROID_HEALTH_PERMISSIONS,
  ANDROID_STEP_PERMISSION,
} from "@/lib/healthConnectPermissions";

type StepStatus =
  | "idle"
  | "unsupported"
  | "permission-required"
  | "permission-denied"
  | "health-connect-unavailable"
  | "health-connect-update-required"
  | "ready"
  | "error";

type StepDebug = {
  aggregateTotal: number;
  caloriesKcal: number | null;
  distanceMeters: number | null;
  groupedError: boolean;
  groupedTotal: number | null;
  originError: boolean;
  originTotals: Record<string, number>;
  selectedDataOrigin: string | null;
  speedSource: "aggregate" | "records" | null;
};

export type StepActivitySummary = {
  averageSpeedKph: number | null;
  caloriesKcal: number | null;
  distanceMeters: number | null;
  steps: number | null;
};

type AndroidStepState = {
  canRequestPermission: boolean;
  dataOrigins: string[];
  debug: StepDebug | null;
  missingHealthPermissions: string[];
  selectedDataOrigin: string | null;
  summary: StepActivitySummary | null;
  status: StepStatus;
  stepsToday: number | null;
};

function permissionKey(permission: { accessType: string; recordType: string }) {
  return `${permission.accessType}:${permission.recordType}`;
}

function hasGrantedPermission(
  grantedPermissions: ReadonlySet<string>,
  recordType: string,
) {
  return grantedPermissions.has(permissionKey({ accessType: "read", recordType }));
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isPermissionError(error: unknown) {
  const message = toErrorMessage(error);
  return (
    message.includes("SecurityException") ||
    message.includes("requires one of the permissions")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function roundMetric(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

async function readTodayStepTotalsByOrigin(
  healthConnect: typeof import("react-native-health-connect"),
  timeRangeFilter: {
    endTime: string;
    operator: "between";
    startTime: string;
  },
  dataOrigins: string[],
) {
  const originTotals: Record<string, number> = {};

  for (const origin of dataOrigins) {
    const aggregate = await healthConnect.aggregateRecord({
      dataOriginFilter: [origin],
      recordType: "Steps",
      timeRangeFilter,
    });
    originTotals[origin] = Math.max(
      0,
      Math.round(aggregate.COUNT_TOTAL ?? 0),
    );
  }

  return originTotals;
}

function selectStepTotalFromOrigins(
  aggregateTotal: number,
  originTotals: Record<string, number>,
) {
  let selectedDataOrigin: string | null = null;
  let highestOriginTotal = 0;
  let preferredDataOrigin: string | null = null;
  let preferredOriginTotal = 0;

  for (const [origin, total] of Object.entries(originTotals)) {
    if (total > highestOriginTotal) {
      highestOriginTotal = total;
      selectedDataOrigin = origin;
    }

    // Prefer app-provided sources over the generic Android on-device source.
    if (origin !== "android" && total > preferredOriginTotal) {
      preferredOriginTotal = total;
      preferredDataOrigin = origin;
    }
  }

  return {
    selectedDataOrigin: preferredDataOrigin ?? selectedDataOrigin,
    total:
      preferredDataOrigin !== null
        ? preferredOriginTotal
        : selectedDataOrigin !== null
          ? highestOriginTotal
          : aggregateTotal,
  };
}

async function readStepAggregateSummary(
  healthConnect: typeof import("react-native-health-connect"),
  timeRangeFilter: {
    endTime: string;
    operator: "between";
    startTime: string;
  },
  grantedPermissions: ReadonlySet<string>,
  selectedDataOrigin: string | null,
) {
  type AggregateRecordResult = Awaited<
    ReturnType<typeof healthConnect.aggregateRecord>
  >;
  type SpeedReadResult = {
    source: "aggregate" | "records" | null;
    value: number | null;
  };
  const aggregateFilters = selectedDataOrigin
    ? [[selectedDataOrigin], undefined]
    : [undefined];

  const readAggregateMetric = async (
    recordType: "Distance" | "TotalCaloriesBurned",
    pickValue: (result: AggregateRecordResult) => number | null,
  ) => {
    if (!hasGrantedPermission(grantedPermissions, recordType)) {
      return null;
    }

    for (const filter of aggregateFilters) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const result = await healthConnect.aggregateRecord({
            dataOriginFilter: filter,
            recordType,
            timeRangeFilter,
          });
          const value = roundMetric(pickValue(result));
          if (value !== null) {
            return value;
          }
          break;
        } catch (error) {
          if (attempt === 0 && isPermissionError(error)) {
            await sleep(350);
            continue;
          }
          break;
        }
      }
    }

    return null;
  };

  const readAverageSpeed = async (): Promise<SpeedReadResult> => {
    if (!hasGrantedPermission(grantedPermissions, "Speed")) {
      return { source: null, value: null };
    }

    for (const filter of aggregateFilters) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const result = await healthConnect.aggregateRecord({
            dataOriginFilter: filter,
            recordType: "Speed",
            timeRangeFilter,
          });
          const value = roundMetric(result.SPEED_AVG?.inKilometersPerHour ?? null);
          if (value !== null) {
            return {
              source: "aggregate" as const,
              value,
            };
          }
          break;
        } catch (error) {
          if (attempt === 0 && isPermissionError(error)) {
            await sleep(350);
            continue;
          }
          break;
        }
      }
    }

    try {
      const records = await healthConnect.readRecords("Speed", {
        ascendingOrder: true,
        pageSize: 500,
        timeRangeFilter,
      });
      const pickSpeeds = (filterByOrigin: boolean) =>
        records.records
          .filter((record) =>
            !filterByOrigin ||
            !selectedDataOrigin ||
            record.metadata?.dataOrigin?.trim() === selectedDataOrigin,
          )
          .flatMap((record) =>
            (record.samples ?? [])
              .map((sample) => sample.speed?.inKilometersPerHour ?? null)
              .filter(
                (value): value is number =>
                  typeof value === "number" && Number.isFinite(value),
              ),
          );

      const originSpeeds = pickSpeeds(true);
      const speeds = originSpeeds.length ? originSpeeds : pickSpeeds(false);
      if (!speeds.length) {
        return { source: null, value: null };
      }
      const total = speeds.reduce((sum, value) => sum + value, 0);
      return {
        source: "records" as const,
        value: roundMetric(total / speeds.length),
      };
    } catch {
      return { source: null, value: null };
    }
  };

  const [distanceMeters, caloriesKcal, speed] = await Promise.all([
    readAggregateMetric(
      "Distance",
      (result) => (result as { DISTANCE?: { inMeters?: number } }).DISTANCE?.inMeters ?? null,
    ),
    readAggregateMetric(
      "TotalCaloriesBurned",
      (result) =>
        (result as { ENERGY_TOTAL?: { inKilocalories?: number } }).ENERGY_TOTAL
          ?.inKilocalories ?? null,
    ),
    readAverageSpeed(),
  ]);

  return {
    caloriesKcal,
    distanceMeters,
    speedSource: speed.source,
    averageSpeedKph: speed.value,
  };
}

async function loadAndroidStepState() {
  const healthConnect = await import("react-native-health-connect");
  const sdkStatus = await healthConnect.getSdkStatus();

  if (sdkStatus === healthConnect.SdkAvailabilityStatus.SDK_UNAVAILABLE) {
    return {
      canRequestPermission: false,
      dataOrigins: [],
      debug: null as StepDebug | null,
      missingHealthPermissions: [],
      selectedDataOrigin: null,
      summary: null,
      status: "health-connect-unavailable" as const,
      stepsToday: null,
    } satisfies AndroidStepState;
  }

  if (
    sdkStatus ===
    healthConnect.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
  ) {
    return {
      canRequestPermission: false,
      dataOrigins: [],
      debug: null as StepDebug | null,
      missingHealthPermissions: [],
      selectedDataOrigin: null,
      summary: null,
      status: "health-connect-update-required" as const,
      stepsToday: null,
    } satisfies AndroidStepState;
  }

  const initialized = await healthConnect.initialize();
  if (!initialized) {
    return {
      canRequestPermission: false,
      dataOrigins: [],
      debug: null as StepDebug | null,
      missingHealthPermissions: [],
      selectedDataOrigin: null,
      summary: null,
      status: "error" as const,
      stepsToday: null,
    } satisfies AndroidStepState;
  }

  const grantedPermissions = await healthConnect.getGrantedPermissions();
  const grantedPermissionKeys = grantedPermissions.map(permissionKey);
  const grantedPermissionKeySet = new Set(grantedPermissionKeys);
  const requestedPermissionKeys = ANDROID_HEALTH_PERMISSIONS.map(permissionKey);
  const missingHealthPermissions = requestedPermissionKeys.filter(
    (key) => !grantedPermissionKeys.includes(key),
  );

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
      missingHealthPermissions,
      selectedDataOrigin: null,
      summary: null,
      status: "permission-required" as const,
      stepsToday: null,
    } satisfies AndroidStepState;
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const now = new Date();
  const endOfDay = new Date(startOfDay);
  endOfDay.setHours(23, 59, 59, 999);
  const timeRangeFilter = {
    endTime: endOfDay.toISOString(),
    operator: "between" as const,
    startTime: startOfDay.toISOString(),
  };

  const aggregate = await healthConnect.aggregateRecord({
    recordType: "Steps",
    timeRangeFilter,
  });
  const aggregateTotal = Math.max(0, Math.round(aggregate.COUNT_TOTAL ?? 0));
  let originTotals: Record<string, number> = {};
  let originError = false;

  try {
    originTotals = await readTodayStepTotalsByOrigin(
      healthConnect,
      timeRangeFilter,
      aggregate.dataOrigins ?? [],
    );
  } catch (error) {
    originError = true;
    console.log("Health Connect step origin read failed", {
      endTime: endOfDay.toISOString(),
      error: toErrorMessage(error),
      now: now.toISOString(),
      startOfDay: startOfDay.toISOString(),
      aggregateDataOrigins: aggregate.dataOrigins ?? [],
      originAggregateTimeRangeFilter: timeRangeFilter,
    });
  }
  let groupedTotal: number | null = null;
  let groupedError = false;

  try {
    const dailyAggregate = await healthConnect.aggregateGroupByDuration({
      recordType: "Steps",
      timeRangeFilter,
      timeRangeSlicer: {
        duration: "DAYS",
        length: 1,
      },
    });
    groupedTotal = dailyAggregate.reduce(
      (total, group) =>
        total + Math.max(0, Math.round(group.result.COUNT_TOTAL ?? 0)),
      0,
    );
  } catch (error) {
    groupedError = true;
    console.log("Health Connect grouped step aggregate failed", {
      error: toErrorMessage(error),
      now: now.toISOString(),
      timeRangeFilter,
    });
  }

  const selected = selectStepTotalFromOrigins(aggregateTotal, originTotals);
  let summary: StepActivitySummary | null = null;
  let speedSource: StepDebug["speedSource"] = null;
  try {
    const aggregateSummary = await readStepAggregateSummary(
      healthConnect,
      timeRangeFilter,
      grantedPermissionKeySet,
      selected.selectedDataOrigin,
    );
    summary = {
      averageSpeedKph: aggregateSummary.averageSpeedKph,
      caloriesKcal: aggregateSummary.caloriesKcal,
      distanceMeters: aggregateSummary.distanceMeters,
      steps: selected.total,
    };
    speedSource = aggregateSummary.speedSource;
  } catch (error) {
    console.log("Health Connect step aggregate read failed", {
      error: toErrorMessage(error),
      selectedDataOrigin: selected.selectedDataOrigin,
      timeRangeFilter,
    });
    summary = {
      averageSpeedKph: null,
      caloriesKcal: null,
      distanceMeters: null,
      steps: selected.total,
    };
  }

  const stepsToday = selected.total;

  return {
    canRequestPermission: true,
    dataOrigins:
      Object.keys(originTotals).length > 0
        ? Object.keys(originTotals)
        : (aggregate.dataOrigins ?? []),
    debug: {
      aggregateTotal,
      caloriesKcal: summary?.caloriesKcal ?? null,
      distanceMeters: summary?.distanceMeters ?? null,
      originError,
      groupedError,
      groupedTotal,
      originTotals,
      selectedDataOrigin: selected.selectedDataOrigin,
      speedSource,
    },
    missingHealthPermissions,
    selectedDataOrigin: selected.selectedDataOrigin,
    summary,
    status: "ready" as const,
    stepsToday,
  } satisfies AndroidStepState;
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
  const [debug, setDebug] = useState<{
    aggregateTotal: number;
    caloriesKcal: number | null;
    distanceMeters: number | null;
    groupedError: boolean;
    groupedTotal: number | null;
    originError: boolean;
    originTotals: Record<string, number>;
    selectedDataOrigin: string | null;
    speedSource: "aggregate" | "records" | null;
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
      setMissingHealthPermissions(result.missingHealthPermissions);
      setSelectedDataOrigin(result.selectedDataOrigin);
      setSummary(result.summary);
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
    } catch (error) {
      console.log("Health Connect permission request failed", {
        error: toErrorMessage(error),
      });
      setStatus("error");
    }
  };

  const percentOfGoal = useMemo(() => {
    if (stepsToday === null || goal <= 0) return null;
    return Math.min(1, stepsToday / goal);
  }, [goal, stepsToday]);

  return {
    dataOrigins,
    debug,
    goal,
    missingHealthPermissions,
    percentOfGoal,
    requestAccess,
    selectedDataOrigin,
    stepSummary: summary,
    status,
    stepsToday,
  };
}
