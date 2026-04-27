import {
  ANDROID_HEALTH_PERMISSIONS,
  ANDROID_STEP_PERMISSION,
} from "@/lib/healthConnectPermissions";

export type StepStatus =
  | "idle"
  | "unsupported"
  | "permission-required"
  | "permission-denied"
  | "health-connect-unavailable"
  | "health-connect-update-required"
  | "ready"
  | "error";

export type StepDebug = {
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

export type HealthConnectStepSummaryRecord = StepActivitySummary & {
  selectedDataOrigin: string | null;
};

export type AndroidStepState = {
  backgroundReadGranted: boolean;
  canRequestPermission: boolean;
  dataOrigins: string[];
  debug: StepDebug | null;
  missingHealthPermissions: string[];
  selectedDataOrigin: string | null;
  summary: StepActivitySummary | null;
  status: StepStatus;
  stepsToday: number | null;
};

const ANDROID_STEP_STATE_CACHE_TTL_MS = 30_000;

let cachedAndroidStepState:
  | {
      expiresAt: number;
      value: AndroidStepState;
    }
  | null = null;
let inFlightAndroidStepStatePromise: Promise<AndroidStepState> | null = null;

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

function isQuotaError(error: unknown) {
  return toErrorMessage(error).includes("API call quota exceeded");
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

function dayTimeRange(date: Date) {
  const start = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return {
    endTime: end.toISOString(),
    operator: "between" as const,
    startTime: start.toISOString(),
  };
}

function hourTimeRange(dayStart: Date, hour: number) {
  const start = new Date(dayStart);
  start.setHours(hour, 0, 0, 0);
  const end = new Date(start);
  end.setHours(hour + 1, 0, 0, 0);

  return {
    endTime: new Date(end.getTime() - 1).toISOString(),
    operator: "between" as const,
    startTime: start.toISOString(),
  };
}

async function readStepTotalsByOrigin(
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

function selectHourlyStepDataOrigin(originTotals: Record<string, number>) {
  if (typeof originTotals.android === "number" && originTotals.android > 0) {
    return "android";
  }

  const selected = selectStepTotalFromOrigins(0, originTotals);
  return selected.selectedDataOrigin;
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
      (result) =>
        (result as { DISTANCE?: { inMeters?: number } }).DISTANCE?.inMeters ??
        null,
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
    averageSpeedKph: speed.value,
    caloriesKcal,
    distanceMeters,
    speedSource: speed.source,
  };
}

export async function readHealthConnectStepSummaryRecordForDate(date: Date) {
  const healthConnect = await import("react-native-health-connect");
  const sdkStatus = await healthConnect.getSdkStatus();
  if (
    sdkStatus === healthConnect.SdkAvailabilityStatus.SDK_UNAVAILABLE ||
    sdkStatus ===
      healthConnect.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
  ) {
    return null;
  }

  const initialized = await healthConnect.initialize();
  if (!initialized) {
    return null;
  }

  const grantedPermissions = await healthConnect.getGrantedPermissions();
  const grantedPermissionKeys = grantedPermissions.map(permissionKey);
  const grantedPermissionKeySet = new Set(grantedPermissionKeys);
  const hasStepAccess = grantedPermissions.some(
    (permission) =>
      permission.accessType === ANDROID_STEP_PERMISSION.accessType &&
      permission.recordType === ANDROID_STEP_PERMISSION.recordType,
  );
  if (!hasStepAccess) {
    return null;
  }

  const timeRangeFilter = dayTimeRange(date);
  const aggregate = await healthConnect.aggregateRecord({
    recordType: "Steps",
    timeRangeFilter,
  });
  const aggregateTotal = Math.max(0, Math.round(aggregate.COUNT_TOTAL ?? 0));
  let originTotals: Record<string, number> = {};

  try {
    originTotals = await readStepTotalsByOrigin(
      healthConnect,
      timeRangeFilter,
      aggregate.dataOrigins ?? [],
    );
  } catch (error) {
    console.log("Health Connect historical step origin read failed", {
      date: date.toISOString(),
      error: toErrorMessage(error),
      timeRangeFilter,
    });
  }

  const selected = selectStepTotalFromOrigins(aggregateTotal, originTotals);
  const aggregateSummary = await readStepAggregateSummary(
    healthConnect,
    timeRangeFilter,
    grantedPermissionKeySet,
    selected.selectedDataOrigin,
  );

  return {
    averageSpeedKph: aggregateSummary.averageSpeedKph,
    caloriesKcal: aggregateSummary.caloriesKcal,
    distanceMeters: aggregateSummary.distanceMeters,
    selectedDataOrigin: selected.selectedDataOrigin,
    steps: selected.total,
  } satisfies HealthConnectStepSummaryRecord;
}

export async function readHealthConnectStepSummaryForDate(date: Date) {
  const record = await readHealthConnectStepSummaryRecordForDate(date);
  if (!record) {
    return null;
  }

  return {
    averageSpeedKph: record.averageSpeedKph,
    caloriesKcal: record.caloriesKcal,
    distanceMeters: record.distanceMeters,
    steps: record.steps,
  } satisfies StepActivitySummary;
}

function bucketHourlyStepValues(
  records: { count?: number; endTime: string; startTime: string }[],
  dayStart: Date,
  nextDayStartMs: number,
) {
  const hourly = Array.from({ length: 24 }, () => 0);
  const longRecordThresholdMs = 2 * 60 * 60 * 1000;

  for (const record of records) {
    const start = new Date(record.startTime);
    const end = new Date(record.endTime);
    const count =
      typeof record.count === "number" && Number.isFinite(record.count)
        ? Math.max(0, record.count)
        : 0;
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      count <= 0
    ) {
      continue;
    }

    const startMs = start.getTime();
    if (startMs >= nextDayStartMs) {
      break;
    }

    const endMs = end.getTime();
    const durationMs = Math.max(1, endMs - startMs);

    if (durationMs >= longRecordThresholdMs) {
      const anchorTime = new Date(Math.min(endMs, nextDayStartMs - 1));
      if (!Number.isNaN(anchorTime.getTime())) {
        hourly[anchorTime.getHours()] += count;
      }
      continue;
    }

    for (let hour = 0; hour < 24; hour += 1) {
      const bucketStart = new Date(dayStart);
      bucketStart.setHours(hour, 0, 0, 0);
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setHours(hour + 1, 0, 0, 0);

      const overlapStart = Math.max(startMs, bucketStart.getTime());
      const overlapEnd = Math.min(endMs, bucketEnd.getTime());
      const overlapMs = overlapEnd - overlapStart;
      if (overlapMs <= 0) {
        continue;
      }

      hourly[hour] += count * (overlapMs / durationMs);
    }
  }

  return hourly.map((value) => Math.round(value));
}

function clampTodayFutureHours(date: Date, hourly: number[]) {
  const now = new Date();
  const isToday =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate();

  if (!isToday) {
    return hourly;
  }

  return hourly.map((value, hour) => (hour > now.getHours() ? 0 : value));
}

function hasFlatHourlyDistribution(values: number[]) {
  const nonZero = values.filter((value) => value > 0);
  if (nonZero.length < 12) {
    return false;
  }

  return nonZero.every((value) => value === nonZero[0]);
}

async function readHourlyStepAggregateFallback(
  healthConnect: typeof import("react-native-health-connect"),
  date: Date,
  selectedDataOrigin: string | null,
) {
  const dayStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
  const hourly = Array.from({ length: 24 }, () => 0);

  for (let hour = 0; hour < 24; hour += 1) {
    const aggregate = await healthConnect.aggregateRecord({
      dataOriginFilter: selectedDataOrigin ? [selectedDataOrigin] : undefined,
      recordType: "Steps",
      timeRangeFilter: hourTimeRange(dayStart, hour),
    });
    hourly[hour] = Math.max(0, Math.round(aggregate.COUNT_TOTAL ?? 0));
  }

  return hourly;
}

export async function readHealthConnectHourlyStepsForDate(date: Date) {
  const healthConnect = await import("react-native-health-connect");
  const sdkStatus = await healthConnect.getSdkStatus();
  if (
    sdkStatus === healthConnect.SdkAvailabilityStatus.SDK_UNAVAILABLE ||
    sdkStatus ===
      healthConnect.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED
  ) {
    return null;
  }

  const initialized = await healthConnect.initialize();
  if (!initialized) {
    return null;
  }

  const grantedPermissions = await healthConnect.getGrantedPermissions();
  const hasStepAccess = grantedPermissions.some(
    (permission) =>
      permission.accessType === ANDROID_STEP_PERMISSION.accessType &&
      permission.recordType === ANDROID_STEP_PERMISSION.recordType,
  );
  if (!hasStepAccess) {
    return null;
  }

  const dayStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
  const dayStartIso = dayStart.toISOString();
  const dayRange = dayTimeRange(date);
  const dayAggregate = await healthConnect.aggregateRecord({
    recordType: "Steps",
    timeRangeFilter: dayRange,
  });
  let originTotals: Record<string, number> = {};

  try {
    originTotals = await readStepTotalsByOrigin(
      healthConnect,
      dayRange,
      dayAggregate.dataOrigins ?? [],
    );
  } catch (error) {
    console.log("HC hourly steps origin read failed v6", {
      aggregateDataOrigins: dayAggregate.dataOrigins ?? [],
      date: date.toISOString(),
      error: toErrorMessage(error),
    });
  }

  const selected = selectStepTotalFromOrigins(
    Math.max(0, Math.round(dayAggregate.COUNT_TOTAL ?? 0)),
    originTotals,
  );
  const selectedHourlyDataOrigin = selectHourlyStepDataOrigin(originTotals);

  console.log("HC hourly steps v6 aggregate request", {
    date: date.toISOString(),
    dayStartIso,
    endTime: dayRange.endTime,
    operator: dayRange.operator,
    originTotals,
    selectedDataOrigin: selected.selectedDataOrigin,
    selectedHourlyDataOrigin,
  });

  try {
    const hourly = clampTodayFutureHours(
      date,
      await readHourlyStepAggregateFallback(
        healthConnect,
        date,
        selectedHourlyDataOrigin,
      ),
    );
    if (hasFlatHourlyDistribution(hourly)) {
      console.log("HC hourly steps v6 unavailable-flat-aggregate", {
        date: date.toISOString(),
        hourly,
      });
      return null;
    }

    return hourly;
  } catch (error) {
    console.log("HC hourly steps aggregate failed v6", {
      date: date.toISOString(),
      error: toErrorMessage(error),
    });
    return null;
  }
}

async function loadAndroidStepStateFresh() {
  const healthConnect = await import("react-native-health-connect");
  const sdkStatus = await healthConnect.getSdkStatus();

  if (sdkStatus === healthConnect.SdkAvailabilityStatus.SDK_UNAVAILABLE) {
    return {
      backgroundReadGranted: false,
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
      backgroundReadGranted: false,
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
      backgroundReadGranted: false,
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
  const backgroundReadGranted = grantedPermissions.some(
    (permission) =>
      permission.accessType === "read" &&
      permission.recordType === "BackgroundAccessPermission",
  );
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
      backgroundReadGranted,
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

  const now = new Date();
  const timeRangeFilter = dayTimeRange(now);
  const aggregate = await healthConnect.aggregateRecord({
    recordType: "Steps",
    timeRangeFilter,
  });
  const aggregateTotal = Math.max(0, Math.round(aggregate.COUNT_TOTAL ?? 0));
  let originTotals: Record<string, number> = {};
  let originError = false;

  try {
    originTotals = await readStepTotalsByOrigin(
      healthConnect,
      timeRangeFilter,
      aggregate.dataOrigins ?? [],
    );
  } catch (error) {
    originError = true;
    console.log("Health Connect step origin read failed", {
      aggregateDataOrigins: aggregate.dataOrigins ?? [],
      error: toErrorMessage(error),
      now: now.toISOString(),
      originAggregateTimeRangeFilter: timeRangeFilter,
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

  return {
    backgroundReadGranted,
    canRequestPermission: true,
    dataOrigins:
      Object.keys(originTotals).length > 0
        ? Object.keys(originTotals)
        : (aggregate.dataOrigins ?? []),
    debug: {
      aggregateTotal,
      caloriesKcal: summary?.caloriesKcal ?? null,
      distanceMeters: summary?.distanceMeters ?? null,
      groupedError: false,
      groupedTotal: null,
      originError,
      originTotals,
      selectedDataOrigin: selected.selectedDataOrigin,
      speedSource,
    },
    missingHealthPermissions,
    selectedDataOrigin: selected.selectedDataOrigin,
    summary,
    status: "ready" as const,
    stepsToday: selected.total,
  } satisfies AndroidStepState;
}

export async function loadAndroidStepState(options: { forceRefresh?: boolean } = {}) {
  const now = Date.now();

  if (
    !options.forceRefresh &&
    cachedAndroidStepState &&
    cachedAndroidStepState.expiresAt > now
  ) {
    return cachedAndroidStepState.value;
  }

  if (!options.forceRefresh && inFlightAndroidStepStatePromise) {
    return inFlightAndroidStepStatePromise;
  }

  inFlightAndroidStepStatePromise = loadAndroidStepStateFresh()
    .then((value) => {
      cachedAndroidStepState = {
        expiresAt: Date.now() + ANDROID_STEP_STATE_CACHE_TTL_MS,
        value,
      };
      return value;
    })
    .catch((error: unknown) => {
      if (cachedAndroidStepState && isQuotaError(error)) {
        console.log("Health Connect step state quota exceeded, using cached state", {
          error: toErrorMessage(error),
        });
        return cachedAndroidStepState.value;
      }
      throw error;
    })
    .finally(() => {
      inFlightAndroidStepStatePromise = null;
    });

  return inFlightAndroidStepStatePromise;
}
