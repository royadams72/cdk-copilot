import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import {
  readHealthConnectHourlyStepsForDate,
  readHealthConnectStepSummaryForDate,
  type StepActivitySummary,
} from "@/lib/healthConnectStepSummary";
import {
  backfillHealthConnectMeasurementDates,
  backfillHealthConnectStepDates,
  readHealthConnectHeartRateEntriesForDate,
} from "@/lib/healthConnectSync";
import { scheduleDevSleepReminderNotification } from "@/lib/pushNotifications";
import { toQueryErrorMessage } from "@/store/services/appApi";
import {
  useCreateMeasurementMutation,
  useGetExerciseReferenceQuery,
  useGetMeasurementHistoryQuery,
  useGetWeeklySleepSummaryQuery,
  useLazyGetWeeklySleepSummaryQuery,
} from "@/store/services/measurementsApi";
import { useGetCurrentUserSettingsQuery } from "@/store/services/userApi";
import type {
  CreateMeasurementArgs,
  MeasurementDayEntry,
} from "@/store/services/types";

import { Card } from "../dashboard/components/Card";
import { AddMeasurementModal } from "./AddMeasurementModal";
import { MetricBarChart } from "./components/MetricBarChart";
import { MetricDayEntries } from "./components/MetricDayEntries";
import { MetricHourlyBarChart } from "./components/MetricHourlyBarChart";
import type {
  ChartPoint,
  MeasurementKind,
  TrendPoint,
} from "./metricTrendTypes";
import {
  addDays,
  addLabel,
  BAR_WIDTH,
  BP_TARGET_DIASTOLIC,
  BP_TARGET_SYSTOLIC,
  CHART_HEIGHT,
  CHART_PAD,
  CHART_WIDTH,
  combineDateAndTime,
  convertLbToKg,
  dateKey,
  dateToMeasuredAtIso,
  EXERCISE_TARGET_MIN,
  formatDayLabel,
  formatDistanceValue,
  formatSleepHours,
  formatStepMetric,
  formatWeightValue,
  getStepSummaryFromEntries,
  GROUP_GAP,
  metricUnit,
  numberRange,
  SLEEP_TARGET_MIN,
  SLOT_GAP,
  sortEntriesForTrendDay,
  weightUnitFromUserUnits,
} from "./metricTrendUtils";

type TrendChart = {
  chartWidth: number;
  points: ChartPoint[];
  targetLines: { color: string; label: string; y: number }[];
  yMax: number;
  yMin: number;
};

const STEP_FINALIZATION_BATCH_SIZE = 7;
const STEP_FINALIZATION_DISCOVERY_DAYS = 30;

function buildHeartRateHourlyValues(
  entries: { measuredAt: string; value: number | null }[],
) {
  const buckets = Array.from({ length: 24 }, () => [] as number[]);

  for (const entry of entries) {
    if (typeof entry.value !== "number" || !Number.isFinite(entry.value)) {
      continue;
    }
    const time = new Date(entry.measuredAt);
    if (Number.isNaN(time.getTime())) {
      continue;
    }
    buckets[time.getHours()].push(entry.value);
  }

  return buckets.map((bucket) => {
    if (!bucket.length) {
      return null;
    }
    const total = bucket.reduce((sum, value) => sum + value, 0);
    return Math.round(total / bucket.length);
  });
}

function sameDayEntries(
  left: MeasurementDayEntry[],
  right: MeasurementDayEntry[],
) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((entry, index) => {
    const candidate = right[index];
    return (
      candidate?.measuredAt === entry.measuredAt &&
      candidate?.value === entry.value &&
      candidate?.value2 === entry.value2
    );
  });
}

export default function FitnessMetricTrend() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string; label?: string }>();
  const kind = (params.kind as MeasurementKind) || "steps";
  const label = typeof params.label === "string" ? params.label : "Trend";

  const [saving, setSaving] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSleepFromPicker, setShowSleepFromPicker] = useState(false);
  const [showSleepToPicker, setShowSleepToPicker] = useState(false);
  const [measuredDate, setMeasuredDate] = useState(new Date());
  const [exerciseMinutes, setExerciseMinutes] = useState("");
  const [healthConnectStepSummary, setHealthConnectStepSummary] =
    useState<StepActivitySummary | null>(null);
  const [hourlyStepValues, setHourlyStepValues] = useState<(number | null)[]>(
    [],
  );
  const [healthConnectHeartRateEntries, setHealthConnectHeartRateEntries] =
    useState<MeasurementDayEntry[]>([]);
  const [healthConnectHeartRateDateKey, setHealthConnectHeartRateDateKey] =
    useState<string | null>(null);
  const [heartRateDayLoading, setHeartRateDayLoading] = useState(false);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(
    {},
  );
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [bpSystolic, setBpSystolic] = useState(BP_TARGET_SYSTOLIC);
  const [bpDiastolic, setBpDiastolic] = useState(BP_TARGET_DIASTOLIC);
  const [heartRateBpm, setHeartRateBpm] = useState(72);
  const [weightValue, setWeightValue] = useState(70);
  const [weightDecimal, setWeightDecimal] = useState(5);
  const [historyBackfillState, setHistoryBackfillState] = useState<{
    error: string | null;
    missingCount: number;
    running: boolean;
  }>({
    error: null,
    missingCount: 0,
    running: false,
  });
  const attemptedBackfillWindowsRef = useRef<Set<string>>(new Set());
  const [sleepFromTime, setSleepFromTime] = useState(() => {
    const value = new Date();
    value.setHours(23, 0, 0, 0);
    return value;
  });
  const [sleepToTime, setSleepToTime] = useState(() => {
    const value = new Date();
    value.setHours(7, 0, 0, 0);
    return value;
  });

  const systolicOptions = useMemo(() => numberRange(90, 220), []);
  const diastolicOptions = useMemo(() => numberRange(50, 140), []);
  const heartRateOptions = useMemo(() => numberRange(35, 220), []);
  const exerciseDurationOptions = useMemo(
    () => numberRange(5, 240).filter((value) => value % 5 === 0),
    [],
  );
  const weightDecimalOptions = useMemo(() => numberRange(1, 9), []);
  const weightKgOptions = useMemo(() => numberRange(30, 250), []);
  const weightLbOptions = useMemo(() => numberRange(66, 550), []);

  const {
    data: history,
    error: historyError,
    isFetching: isHistoryFetching,
    isLoading: isHistoryLoading,
    refetch: refetchHistory,
  } = useGetMeasurementHistoryQuery(kind);
  const { data: currentUserSettings } = useGetCurrentUserSettingsQuery();
  const {
    data: exerciseReference,
    error: exerciseReferenceError,
    isFetching: exerciseCatalogLoading,
  } = useGetExerciseReferenceQuery(undefined, {
    skip: kind !== "exercise",
  });
  const [createMeasurement] = useCreateMeasurementMutation();
  const [loadWeeklySleepSummary] = useLazyGetWeeklySleepSummaryQuery();
  const { data: weeklySleepSummary } = useGetWeeklySleepSummaryQuery(
    undefined,
    {
      skip: kind !== "sleep",
    },
  );
  const preferredWeightUnit = weightUnitFromUserUnits(
    currentUserSettings?.units ?? "metric",
  );
  const weightOptions =
    preferredWeightUnit === "lb" ? weightLbOptions : weightKgOptions;

  const points = history?.points ?? [];
  const entriesByDate = history?.entriesByDate ?? {};
  const exerciseCatalog = exerciseReference?.categories ?? [];
  const loading = isHistoryLoading && !history;
  const refreshing = isHistoryFetching && !!history;
  const error = historyError
    ? toQueryErrorMessage(historyError, "Failed to load trend")
    : null;
  const exerciseCatalogError = exerciseReferenceError
    ? toQueryErrorMessage(
        exerciseReferenceError,
        "Failed to load exercise reference",
      )
    : null;

  const selectedExercise = useMemo(() => {
    for (const category of exerciseCatalog) {
      const match = category.items.find(
        (item) => item.exerciseId === selectedExerciseId,
      );
      if (match) return match;
    }
    return null;
  }, [exerciseCatalog, selectedExerciseId]);

  useEffect(() => {
    if (!exerciseCatalog.length) return;
    const firstCategory = exerciseCatalog[0];
    const firstExercise = firstCategory.items?.[0];
    if (firstCategory) {
      setOpenCategories((prev) =>
        Object.keys(prev).length ? prev : { [firstCategory.category]: true },
      );
    }
    if (firstExercise) {
      setSelectedExerciseId((prev) => prev || firstExercise.exerciseId);
    }
  }, [exerciseCatalog]);

  const chart = useMemo<TrendChart>(() => {
    const numeric = points.filter(
      (point) =>
        typeof (kind === "exercise" ? point.value2 : point.value) ===
          "number" &&
        Number.isFinite(kind === "exercise" ? point.value2 : point.value),
    );
    if (numeric.length === 0) {
      return {
        chartWidth: CHART_WIDTH,
        points: [],
        targetLines: [],
        yMax: 0,
        yMin: 0,
      };
    }

    const values = numeric
      .map((point) =>
        kind === "exercise" ? (point.value2 as number) : point.value,
      )
      .filter((value): value is number => value !== null);
    const values2 =
      kind === "blood_pressure"
        ? numeric
            .map((point) =>
              typeof point.value2 === "number" ? point.value2 : null,
            )
            .filter((value): value is number => value !== null)
        : [];

    const targetValues: number[] = [];
    if (kind === "blood_pressure") {
      targetValues.push(BP_TARGET_SYSTOLIC, BP_TARGET_DIASTOLIC);
    }
    if (kind === "sleep") {
      targetValues.push(SLEEP_TARGET_MIN);
    }
    if (kind === "exercise") {
      targetValues.push(EXERCISE_TARGET_MIN);
    }

    const yMin =
      kind === "blood_pressure"
        ? Math.min(
            ...values,
            ...(values2.length ? values2 : []),
            ...targetValues,
          )
        : 0;
    const yMax = Math.max(
      ...values,
      ...(values2.length ? values2 : []),
      ...targetValues,
    );
    const span = Math.max(1, yMax - yMin);
    const groupWidth =
      kind === "blood_pressure" ? BAR_WIDTH * 2 + GROUP_GAP : BAR_WIDTH;
    const slotWidth = groupWidth + SLOT_GAP;
    const firstDate = new Date(`${numeric[0].date}T12:00:00`);
    const lastDate = new Date(`${numeric[numeric.length - 1].date}T12:00:00`);
    const dailyPoints: TrendPoint[] = [];
    const byDate = new Map(points.map((point) => [point.date, point]));

    for (
      let cursor = firstDate;
      cursor.getTime() <= lastDate.getTime();
      cursor = addDays(cursor, 1)
    ) {
      const currentDateKey = dateKey(cursor);
      const found = byDate.get(currentDateKey);
      dailyPoints.push(
        found ?? {
          date: currentDateKey,
          measuredAt: `${currentDateKey}T12:00:00.000Z`,
          value: null,
          value2: null,
        },
      );
    }

    const chartWidth = Math.max(
      CHART_WIDTH,
      CHART_PAD * 2 + slotWidth * dailyPoints.length,
    );
    const firstX = CHART_PAD + slotWidth / 2;
    const toY = (value: number) =>
      CHART_HEIGHT -
      CHART_PAD -
      ((value - yMin) / span) * (CHART_HEIGHT - CHART_PAD * 2);

    const chartPoints = dailyPoints.map((point, index) => {
      const primaryValueRaw = kind === "exercise" ? point.value2 : point.value;
      const primaryValue =
        typeof primaryValueRaw === "number" && Number.isFinite(primaryValueRaw)
          ? primaryValueRaw
          : null;
      const x = firstX + slotWidth * index;
      const y = toY(primaryValue ?? 0);
      const y2 =
        kind === "blood_pressure" && typeof point.value2 === "number"
          ? toY(point.value2)
          : undefined;
      const barX =
        kind === "blood_pressure"
          ? x - GROUP_GAP / 2 - BAR_WIDTH
          : x - BAR_WIDTH / 2;
      return {
        barX,
        date: point.date,
        hasValue: primaryValue !== null,
        label: formatDayLabel(point.date),
        value: primaryValue,
        x,
        y,
        y2,
      };
    });

    const targetLines: TrendChart["targetLines"] = [];
    if (kind === "blood_pressure") {
      targetLines.push({
        color: "#2563EB",
        label: `${BP_TARGET_SYSTOLIC}`,
        y: toY(BP_TARGET_SYSTOLIC),
      });
      targetLines.push({
        color: "#F97316",
        label: `${BP_TARGET_DIASTOLIC}`,
        y: toY(BP_TARGET_DIASTOLIC),
      });
    }
    if (kind === "sleep") {
      targetLines.push({
        color: "#0F766E",
        label: "8 h",
        y: toY(SLEEP_TARGET_MIN),
      });
    }
    if (kind === "exercise") {
      targetLines.push({
        color: "#0F766E",
        label: `${EXERCISE_TARGET_MIN}`,
        y: toY(EXERCISE_TARGET_MIN),
      });
    }

    return {
      chartWidth,
      points: chartPoints,
      targetLines,
      yMax,
      yMin,
    };
  }, [kind, points]);

  const latestPoint = useMemo(() => {
    const numeric = points.filter(
      (point) =>
        typeof point.value === "number" && Number.isFinite(point.value),
    );
    return numeric.length ? numeric[numeric.length - 1] : null;
  }, [points]);

  const selectedBarIndex = useMemo(() => {
    if (!selectedDateKey) return null;
    const index = chart.points.findIndex(
      (point) => point.date === selectedDateKey,
    );
    return index >= 0 ? index : null;
  }, [chart.points, selectedDateKey]);

  const existingMetricDateKeys = useMemo(() => {
    if (kind === "steps") {
      return new Set(
        Object.entries(entriesByDate)
          .filter(
            ([, entries]) => getStepSummaryFromEntries(entries).steps !== null,
          )
          .map(([date]) => date),
      );
    }

    if (
      kind === "sleep" ||
      kind === "exercise" ||
      kind === "blood_pressure" ||
      kind === "heart_rate"
    ) {
      return new Set(points.map((point) => point.date));
    }

    return new Set<string>();
  }, [entriesByDate, kind, points]);
  const finalizedStepDateKeys = useMemo(() => {
    if (kind !== "steps") {
      return new Set<string>();
    }

    return new Set(
      Object.entries(entriesByDate)
        .filter(([, entries]) =>
          entries.some((entry) => entry.sync?.status === "finalized"),
        )
        .map(([date]) => date),
    );
  }, [entriesByDate, kind]);

  const selectedDayEntries = useMemo(() => {
    if (!selectedDateKey) return [];
    return sortEntriesForTrendDay(kind, entriesByDate[selectedDateKey] ?? []);
  }, [entriesByDate, kind, selectedDateKey]);
  const selectedDayEntriesSignature = useMemo(
    () =>
      selectedDayEntries
        .map(
          (entry) =>
            `${entry.measuredAt}:${entry.value ?? "null"}:${entry.value2 ?? "null"}`,
        )
        .join("|"),
    [selectedDayEntries],
  );

  const resolvedHeartRateEntries = useMemo(() => {
    if (kind !== "heart_rate") {
      return selectedDayEntries;
    }

    const scopedHealthConnectEntries =
      healthConnectHeartRateDateKey === selectedDateKey
        ? healthConnectHeartRateEntries
        : [];
    if (scopedHealthConnectEntries.length > 0) {
      return sortEntriesForTrendDay(kind, scopedHealthConnectEntries);
    }
    const merged = [...selectedDayEntries, ...scopedHealthConnectEntries];
    const seen = new Set<string>();
    return sortEntriesForTrendDay(
      kind,
      merged.filter((entry) => {
        const key = `${entry.measuredAt}:${entry.value ?? "null"}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      }),
    );
  }, [
    healthConnectHeartRateDateKey,
    healthConnectHeartRateEntries,
    kind,
    selectedDateKey,
    selectedDayEntries,
  ]);
  const scopedHealthConnectHeartRateEntries = useMemo(
    () =>
      kind === "heart_rate" && healthConnectHeartRateDateKey === selectedDateKey
        ? healthConnectHeartRateEntries
        : [],
    [
      healthConnectHeartRateDateKey,
      healthConnectHeartRateEntries,
      kind,
      selectedDateKey,
    ],
  );
  const shouldShowHeartRateMissingState =
    kind !== "heart_rate" || scopedHealthConnectHeartRateEntries.length === 0;

  const selectedStepSummary = useMemo(() => {
    if (kind !== "steps") return null;
    return getStepSummaryFromEntries(selectedDayEntries);
  }, [kind, selectedDayEntries]);

  const isSelectedToday = useMemo(() => {
    if (!selectedDateKey) {
      return false;
    }
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(
      now.getMonth() + 1,
    ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return selectedDateKey === todayKey;
  }, [selectedDateKey]);

  useEffect(() => {
    let cancelled = false;

    const loadHealthConnectStepSummary = async () => {
      if (
        kind !== "steps" ||
        Platform.OS !== "android" ||
        !selectedDateKey ||
        !selectedStepSummary ||
        !isSelectedToday
      ) {
        setHealthConnectStepSummary(null);
        return;
      }

      const needsFallback =
        selectedStepSummary.distanceMeters === null ||
        selectedStepSummary.averageSpeedKph === null ||
        selectedStepSummary.caloriesKcal === null;
      if (!needsFallback) {
        setHealthConnectStepSummary(null);
        return;
      }

      const date = new Date(`${selectedDateKey}T12:00:00`);
      if (Number.isNaN(date.getTime())) {
        setHealthConnectStepSummary(null);
        return;
      }

      try {
        const result = await readHealthConnectStepSummaryForDate(date);
        if (!cancelled) {
          setHealthConnectStepSummary(result);
        }
      } catch (error) {
        console.log("Health Connect historical step summary failed", {
          date: selectedDateKey,
          error: error instanceof Error ? error.message : String(error),
        });
        if (!cancelled) {
          setHealthConnectStepSummary(null);
        }
      }
    };

    void loadHealthConnectStepSummary();

    return () => {
      cancelled = true;
    };
  }, [isSelectedToday, kind, selectedDateKey, selectedStepSummary]);

  const resolvedStepSummary = useMemo(() => {
    if (kind !== "steps" || !selectedStepSummary) {
      return null;
    }

    return {
      averageSpeedKph:
        selectedStepSummary.averageSpeedKph ??
        healthConnectStepSummary?.averageSpeedKph ??
        null,
      caloriesKcal:
        selectedStepSummary.caloriesKcal ??
        healthConnectStepSummary?.caloriesKcal ??
        null,
      distanceMeters:
        selectedStepSummary.distanceMeters ??
        healthConnectStepSummary?.distanceMeters ??
        null,
      steps:
        selectedStepSummary.steps ?? healthConnectStepSummary?.steps ?? null,
    } satisfies StepActivitySummary;
  }, [healthConnectStepSummary, kind, selectedStepSummary]);

  const heartRateHourlyValues = useMemo(() => {
    if (kind !== "heart_rate") {
      return [];
    }
    if (heartRateDayLoading) {
      return [];
    }
    return buildHeartRateHourlyValues(resolvedHeartRateEntries);
  }, [heartRateDayLoading, kind, resolvedHeartRateEntries]);

  useEffect(() => {
    let cancelled = false;

    const loadHeartRateEntries = async () => {
      if (
        kind !== "heart_rate" ||
        Platform.OS !== "android" ||
        !selectedDateKey
      ) {
        setHealthConnectHeartRateEntries((current) =>
          current.length ? [] : current,
        );
        setHealthConnectHeartRateDateKey(null);
        setHeartRateDayLoading(false);
        return;
      }

      setHeartRateDayLoading(true);
      setHealthConnectHeartRateEntries((current) =>
        current.length ? [] : current,
      );
      setHealthConnectHeartRateDateKey(selectedDateKey);

      const date = new Date(`${selectedDateKey}T12:00:00`);
      if (Number.isNaN(date.getTime())) {
        setHealthConnectHeartRateEntries((current) =>
          current.length ? [] : current,
        );
        setHealthConnectHeartRateDateKey(null);
        setHeartRateDayLoading(false);
        return;
      }

      try {
        const entries = await readHealthConnectHeartRateEntriesForDate(date);
        if (!cancelled) {
          setHealthConnectHeartRateDateKey(selectedDateKey);
          setHealthConnectHeartRateEntries((current) =>
            sameDayEntries(current, entries) ? current : entries,
          );
          if (entries.length > 0) {
            setHistoryBackfillState((current) =>
              current.error || current.missingCount > 0 || current.running
                ? {
                    error: null,
                    missingCount: 0,
                    running: false,
                  }
                : current,
            );
          }
          setHeartRateDayLoading(false);
        }
      } catch (heartRateError) {
        console.log("Health Connect heart rate day read failed", {
          date: selectedDateKey,
          error:
            heartRateError instanceof Error
              ? heartRateError.message
              : String(heartRateError),
        });
        if (!cancelled) {
          setHealthConnectHeartRateEntries((current) =>
            current.length ? [] : current,
          );
          setHealthConnectHeartRateDateKey(selectedDateKey);
          setHeartRateDayLoading(false);
        }
      }
    };

    void loadHeartRateEntries();

    return () => {
      cancelled = true;
    };
  }, [kind, selectedDateKey, selectedDayEntriesSignature]);

  useEffect(() => {
    let cancelled = false;

    const loadHourlySteps = async () => {
      if (
        kind !== "steps" ||
        Platform.OS !== "android" ||
        !selectedDateKey ||
        !isSelectedToday
      ) {
        setHourlyStepValues([]);
        return;
      }

      const date = new Date(`${selectedDateKey}T12:00:00`);
      if (Number.isNaN(date.getTime())) {
        setHourlyStepValues([]);
        return;
      }

      try {
        const values = await readHealthConnectHourlyStepsForDate(date);
        if (!cancelled) {
          setHourlyStepValues(
            values?.map((value) => (value > 0 ? value : null)) ?? [],
          );
        }
      } catch (error) {
        console.log("Health Connect hourly steps read failed v5", {
          date: selectedDateKey,
          error: error instanceof Error ? error.message : String(error),
        });
        if (!cancelled) {
          setHourlyStepValues([]);
        }
      }
    };

    void loadHourlySteps();

    return () => {
      cancelled = true;
    };
  }, [isSelectedToday, kind, selectedDateKey]);

  useEffect(() => {
    setMeasuredDate(new Date());
    setExerciseMinutes("30");
    setWeightValue(preferredWeightUnit === "lb" ? 154 : 70);
    setWeightDecimal(5);
    setShowSleepFromPicker(false);
    setShowSleepToPicker(false);
  }, [kind, modalOpen, preferredWeightUnit]);

  useEffect(() => {
    if (
      (kind !== "steps" &&
        kind !== "sleep" &&
        kind !== "exercise" &&
        kind !== "blood_pressure" &&
        kind !== "heart_rate") ||
      Platform.OS !== "android" ||
      loading ||
      !!error
    ) {
      return;
    }

    const todayKey = dateKey(new Date());
    const anchorKey =
      kind === "steps" ? todayKey : (selectedDateKey ?? todayKey);
    const anchorDate = new Date(`${anchorKey}T12:00:00`);
    if (Number.isNaN(anchorDate.getTime())) {
      return;
    }

    const windowEnd =
      kind === "steps" ? addDays(anchorDate, -1) : new Date(anchorDate);
    const lookbackDays =
      kind === "steps"
        ? STEP_FINALIZATION_DISCOVERY_DAYS - 1
        : kind === "heart_rate"
          ? 6
          : 29;
    const windowStart = addDays(windowEnd, -lookbackDays);
    const windowStartKey = dateKey(windowStart);
    const windowEndKey = dateKey(windowEnd);
    const windowKey = `${windowStartKey}:${windowEndKey}`;
    const scopedWindowKey = `${kind}:${windowKey}`;
    if (attemptedBackfillWindowsRef.current.has(scopedWindowKey)) {
      return;
    }

    const missingDateKeys: string[] = [];
    for (
      let cursor = new Date(windowStart);
      cursor.getTime() <= windowEnd.getTime();
      cursor = addDays(cursor, 1)
    ) {
      const currentKey = dateKey(cursor);
      if (kind === "steps") {
        if (finalizedStepDateKeys?.has(currentKey)) {
          continue;
        }
        missingDateKeys.push(currentKey);
        continue;
      }

      if (!existingMetricDateKeys.has(currentKey)) {
        missingDateKeys.push(currentKey);
      }
    }

    if (!missingDateKeys.length) {
      attemptedBackfillWindowsRef.current.add(scopedWindowKey);
      return;
    }

    const dateKeysToResolve =
      kind === "steps"
        ? missingDateKeys.slice(-STEP_FINALIZATION_BATCH_SIZE).reverse()
        : missingDateKeys;

    let cancelled = false;
    attemptedBackfillWindowsRef.current.add(scopedWindowKey);
    setHistoryBackfillState({
      error: null,
      missingCount: dateKeysToResolve.length,
      running: true,
    });

    void (async () => {
      try {
        const metricKind = kind;
        const result =
          metricKind === "steps"
            ? await backfillHealthConnectStepDates(dateKeysToResolve, {
                reason: "steps-screen",
                windowKey,
              })
            : metricKind === "sleep" ||
                metricKind === "exercise" ||
                metricKind === "blood_pressure" ||
                metricKind === "heart_rate"
              ? await backfillHealthConnectMeasurementDates(
                  metricKind,
                  dateKeysToResolve,
                  {
                    reason: "metric-screen",
                    windowKey,
                  },
                )
              : { attempted: 0, resolvedDays: 0, uploaded: 0 };

        if (cancelled) return;

        const remainingMissingCount = Math.max(
          0,
          dateKeysToResolve.length - result.resolvedDays,
        );

        setHistoryBackfillState({
          error:
            result.attempted > 0 && result.resolvedDays === 0
              ? "No matching Health Connect data was found for this window."
              : null,
          missingCount: remainingMissingCount,
          running: false,
        });

        if (result.uploaded > 0) {
          await refetchHistory();
        } else {
          attemptedBackfillWindowsRef.current.delete(scopedWindowKey);
        }
      } catch (backfillError) {
        if (cancelled) return;
        attemptedBackfillWindowsRef.current.delete(scopedWindowKey);
        setHistoryBackfillState({
          error:
            backfillError instanceof Error
              ? backfillError.message
              : "Could not backfill device history.",
          missingCount: dateKeysToResolve.length,
          running: false,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    error,
    existingMetricDateKeys,
    finalizedStepDateKeys,
    kind,
    loading,
    refetchHistory,
    selectedDateKey,
  ]);

  useEffect(() => {
    const latestDate = chart.points[chart.points.length - 1]?.date ?? null;
    if (!latestDate) {
      setSelectedDateKey(null);
      return;
    }

    setSelectedDateKey((current) => {
      if (!current) return latestDate;
      return chart.points.some((point) => point.date === current)
        ? current
        : latestDate;
    });
  }, [chart.points, kind]);

  const onSave = useCallback(async () => {
    if (kind === "steps") return;

    try {
      setSaving(true);
      let payload: CreateMeasurementArgs;

      if (kind === "exercise") {
        if (!selectedExercise) {
          throw new Error("Select an exercise type");
        }
        const value = Number(exerciseMinutes);
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error("Enter valid exercise minutes");
        }
        payload = {
          durationMin: Math.round(value),
          exerciseId: selectedExercise.exerciseId,
          kind: "exercise",
          measuredAt: dateToMeasuredAtIso(measuredDate),
        };
      } else if (kind === "sleep") {
        const sleepToAt = combineDateAndTime(measuredDate, sleepToTime);
        let sleepFromAt = combineDateAndTime(measuredDate, sleepFromTime);
        if (sleepFromAt.getTime() >= sleepToAt.getTime()) {
          sleepFromAt = addDays(sleepFromAt, -1);
        }
        const durationMin = Math.round(
          (sleepToAt.getTime() - sleepFromAt.getTime()) / 60000,
        );
        if (durationMin <= 0) {
          throw new Error("Sleep 'to' time must be after 'from' time");
        }
        payload = {
          durationMin,
          kind: "sleep",
          measuredAt: sleepToAt.toISOString(),
          sleepFromAt: sleepFromAt.toISOString(),
          sleepToAt: sleepToAt.toISOString(),
        };
      } else if (kind === "blood_pressure") {
        if (bpSystolic <= bpDiastolic) {
          throw new Error("Systolic must be greater than diastolic");
        }
        payload = {
          diastolicMmHg: bpDiastolic,
          kind: "blood_pressure",
          measuredAt: dateToMeasuredAtIso(measuredDate),
          systolicMmHg: bpSystolic,
        };
      } else if (kind === "heart_rate") {
        if (!Number.isFinite(heartRateBpm) || heartRateBpm <= 0) {
          throw new Error("Enter a valid heart rate");
        }
        payload = {
          bpm: Math.round(heartRateBpm),
          kind: "heart_rate",
          measuredAt: dateToMeasuredAtIso(measuredDate),
        };
      } else if (kind === "weight") {
        const value = Number(weightValue) + weightDecimal / 10;
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error("Enter a valid weight");
        }
        payload = {
          kind: "weight",
          measuredAt: dateToMeasuredAtIso(measuredDate),
          valueKg:
            preferredWeightUnit === "lb"
              ? Math.round(convertLbToKg(value) * 10) / 10
              : Math.round(value * 10) / 10,
        };
      } else {
        return;
      }

      await createMeasurement(payload).unwrap();
      setExerciseMinutes("30");
      setModalOpen(false);
      await refetchHistory();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Could not save reading";
      Alert.alert("Save failed", message);
    } finally {
      setSaving(false);
    }
  }, [
    kind,
    selectedExercise,
    exerciseMinutes,
    measuredDate,
    sleepToTime,
    sleepFromTime,
    bpSystolic,
    bpDiastolic,
    heartRateBpm,
    weightValue,
    weightDecimal,
    preferredWeightUnit,
    createMeasurement,
    refetchHistory,
  ]);

  const handleDevSleepReminderTest = useCallback(async () => {
    const scheduled = await scheduleDevSleepReminderNotification();
    Alert.alert(
      scheduled ? "Reminder scheduled" : "Reminder unavailable",
      scheduled
        ? "A dev sleep reminder should appear in about 5 seconds."
        : "Could not schedule the dev reminder on this device/build.",
    );
  }, []);

  const handleDevWeeklySleepTest = useCallback(async () => {
    try {
      const summary = await loadWeeklySleepSummary().unwrap();

      if (!summary) {
        Alert.alert(
          "Weekly summary",
          "No weekly sleep summary is available yet for this account.",
        );
        return;
      }

      Alert.alert(
        "Weekly sleep summary",
        [
          `${summary.weekStart} to ${summary.weekEnd}`,
          `Weekly average: ${formatSleepHours(summary.weeklyAverageDurationMin)}`,
          `Logged days: ${summary.loggedDays}/7`,
          `Below target: ${summary.nightsBelowTarget}`,
          summary.splitNights > 0 ? `Split nights: ${summary.splitNights}` : "",
          "",
          summary.humanMessage,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    } catch (error) {
      Alert.alert(
        "Weekly summary failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }, [loadWeeklySleepSummary]);

  const showAdd = kind !== "steps";

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 28 }}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedText style={{ fontWeight: "600" }}>‹ Back</ThemedText>
        </TouchableOpacity>

        <View style={{ gap: 4 }}>
          <ThemedText type="title">{label}</ThemedText>
          <ThemedText style={{ opacity: 0.72 }}>
            Daily readings trend (
            {kind === "weight"
              ? preferredWeightUnit === "lb"
                ? "lbs"
                : "kg"
              : metricUnit(kind)}
            )
          </ThemedText>
          {kind === "weight" &&
          latestPoint &&
          typeof latestPoint.value === "number" &&
          Number.isFinite(latestPoint.value) ? (
            <ThemedText style={{ opacity: 0.7 }}>
              Latest:{" "}
              {formatWeightValue(latestPoint.value, preferredWeightUnit)}
            </ThemedText>
          ) : null}
          {kind === "exercise" &&
          latestPoint &&
          typeof latestPoint.value === "number" &&
          Number.isFinite(latestPoint.value) &&
          latestPoint.value > 0 ? (
            <ThemedText style={{ opacity: 0.7 }}>
              Latest burn: {Math.round(latestPoint.value)} kcal
              {typeof latestPoint.value2 === "number"
                ? ` in ${Math.round(latestPoint.value2)} min`
                : ""}
            </ThemedText>
          ) : null}
        </View>

        {showAdd ? (
          <TouchableOpacity
            onPress={() => setModalOpen(true)}
            style={{
              alignSelf: "flex-start",
              backgroundColor: "rgba(59,130,246,0.16)",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <ThemedText style={{ color: "#1E3A8A", fontWeight: "700" }}>
              {addLabel(kind)}
            </ThemedText>
          </TouchableOpacity>
        ) : (
          <View style={{ gap: 4 }}>
            <ThemedText style={{ opacity: 0.7 }}>
              Steps are synced from your phone/watch.
            </ThemedText>
            {(kind === "steps" ||
              kind === "sleep" ||
              kind === "exercise" ||
              kind === "blood_pressure" ||
              kind === "heart_rate") &&
            historyBackfillState.running ? (
              <ThemedText style={{ opacity: 0.72 }}>
                {kind === "steps"
                  ? `Checking ${historyBackfillState.missingCount} recent step day${
                      historyBackfillState.missingCount === 1 ? "" : "s"
                    } from Health Connect...`
                  : `Filling ${historyBackfillState.missingCount} missing day${
                      historyBackfillState.missingCount === 1 ? "" : "s"
                    } from Health Connect...`}
              </ThemedText>
            ) : null}
            {(kind === "steps" ||
              kind === "sleep" ||
              kind === "exercise" ||
              kind === "blood_pressure" ||
              kind === "heart_rate") &&
            !historyBackfillState.running &&
            historyBackfillState.error &&
            shouldShowHeartRateMissingState ? (
              <ThemedText style={{ color: "#B45309", opacity: 0.88 }}>
                {historyBackfillState.error}
              </ThemedText>
            ) : null}
          </View>
        )}

        {kind !== "steps" &&
        (kind === "sleep" ||
          kind === "exercise" ||
          kind === "blood_pressure" ||
          kind === "heart_rate") &&
        historyBackfillState.running ? (
          <ThemedText style={{ opacity: 0.72 }}>
            Filling {historyBackfillState.missingCount} missing day
            {historyBackfillState.missingCount === 1 ? "" : "s"} from Health
            Connect...
          </ThemedText>
        ) : null}

        {kind !== "steps" &&
        (kind === "sleep" ||
          kind === "exercise" ||
          kind === "blood_pressure" ||
          kind === "heart_rate") &&
        !historyBackfillState.running &&
        historyBackfillState.error &&
        shouldShowHeartRateMissingState ? (
          <ThemedText style={{ color: "#B45309", opacity: 0.88 }}>
            {historyBackfillState.error}
          </ThemedText>
        ) : null}

        {loading ? (
          <View style={{ alignItems: "center", gap: 8, paddingVertical: 26 }}>
            <ActivityIndicator size="large" />
            <ThemedText>Loading trend...</ThemedText>
          </View>
        ) : null}

        {error ? (
          <Card>
            <ThemedText type="defaultSemiBold">Could not load trend</ThemedText>
            <ThemedText style={{ opacity: 0.72 }}>{error}</ThemedText>
            <TouchableOpacity onPress={() => void refetchHistory()}>
              <ThemedText style={{ fontWeight: "700" }}>Retry</ThemedText>
            </TouchableOpacity>
          </Card>
        ) : null}

        {!loading && !error && kind === "sleep" && weeklySleepSummary ? (
          <Card>
            <View style={{ gap: 6 }}>
              <ThemedText type="defaultSemiBold">Weekly sleep check</ThemedText>
              <ThemedText style={{ opacity: 0.72 }}>
                {weeklySleepSummary.weekStart} to {weeklySleepSummary.weekEnd}
              </ThemedText>
              <ThemedText style={{ opacity: 0.82 }}>
                {weeklySleepSummary.humanMessage}
              </ThemedText>
              <ThemedText style={{ opacity: 0.72 }}>
                Weekly average:{" "}
                {formatSleepHours(weeklySleepSummary.weeklyAverageDurationMin)}{" "}
                • Logged days: {weeklySleepSummary.loggedDays}/7
              </ThemedText>
              <ThemedText style={{ opacity: 0.72 }}>
                Nights below target: {weeklySleepSummary.nightsBelowTarget}
                {weeklySleepSummary.splitNights > 0
                  ? ` • Split nights: ${weeklySleepSummary.splitNights}`
                  : ""}
              </ThemedText>
              {weeklySleepSummary.advice.map((item) => (
                <ThemedText key={item} style={{ opacity: 0.78 }}>
                  • {item}
                </ThemedText>
              ))}
            </View>
          </Card>
        ) : null}

        {__DEV__ && kind === "sleep" ? (
          <Card>
            <View style={{ gap: 10 }}>
              <ThemedText type="defaultSemiBold">Dev sleep tools</ThemedText>
              <TouchableOpacity
                onPress={() => void handleDevSleepReminderTest()}
                style={{
                  alignSelf: "flex-start",
                  backgroundColor: "rgba(15,118,110,0.12)",
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <ThemedText style={{ color: "#115E59", fontWeight: "700" }}>
                  Test sleep reminder
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleDevWeeklySleepTest()}
                style={{
                  alignSelf: "flex-start",
                  backgroundColor: "rgba(37,99,235,0.12)",
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <ThemedText style={{ color: "#1D4ED8", fontWeight: "700" }}>
                  Test weekly summary
                </ThemedText>
              </TouchableOpacity>
            </View>
          </Card>
        ) : null}

        {!loading && !error ? (
          <Card>
            {chart.points.length === 0 ? (
              <ThemedText style={{ opacity: 0.72 }}>
                No readings yet.
              </ThemedText>
            ) : (
              <>
                <MetricBarChart
                  chartWidth={chart.chartWidth}
                  kind={kind}
                  points={chart.points}
                  selectedBarIndex={selectedBarIndex}
                  setSelectedBarIndex={(index) => {
                    const nextDate =
                      typeof index === "number"
                        ? (chart.points[index]?.date ?? null)
                        : null;
                    setSelectedDateKey(nextDate);
                  }}
                  targetLines={chart.targetLines}
                />

                {kind === "steps" && resolvedStepSummary ? (
                  <StepSummary summary={resolvedStepSummary} />
                ) : null}

                {selectedDateKey && kind === "steps" ? (
                  hourlyStepValues.length ? (
                    <MetricHourlyBarChart
                      emptyLabel="No step activity recorded for this day."
                      formatSelectedValue={(value) =>
                        typeof value === "number"
                          ? `${Math.round(value).toLocaleString()} steps`
                          : "--"
                      }
                      label="Hourly steps"
                      values={hourlyStepValues}
                    />
                  ) : isSelectedToday &&
                    (resolvedStepSummary?.steps ?? 0) > 0 ? (
                    <ThemedText style={{ marginTop: 14, opacity: 0.66 }}>
                      Hourly step breakdown is unavailable for this source.
                    </ThemedText>
                  ) : !isSelectedToday &&
                    (resolvedStepSummary?.steps ?? 0) > 0 ? (
                    <ThemedText style={{ marginTop: 14, opacity: 0.66 }}>
                      Hourly step breakdown is only available for today.
                    </ThemedText>
                  ) : null
                ) : null}

                {selectedDateKey &&
                kind === "heart_rate" &&
                heartRateHourlyValues.length ? (
                  <MetricHourlyBarChart
                    color="#DC2626"
                    emptyLabel="No heart rate readings for this day."
                    formatSelectedValue={(value) =>
                      typeof value === "number"
                        ? `${Math.round(value)} bpm`
                        : "--"
                    }
                    label="Hourly heart rate"
                    values={heartRateHourlyValues}
                  />
                ) : selectedDateKey &&
                  kind === "heart_rate" &&
                  heartRateDayLoading ? (
                  <ThemedText style={{ marginTop: 14, opacity: 0.66 }}>
                    Loading device heart rate...
                  </ThemedText>
                ) : null}

                {selectedDateKey &&
                kind !== "steps" &&
                kind !== "heart_rate" ? (
                  <MetricDayEntries
                    kind={kind}
                    selectedDateKey={selectedDateKey}
                    selectedDayEntries={selectedDayEntries}
                    weightUnit={preferredWeightUnit}
                  />
                ) : null}

                {chart.targetLines.length ? (
                  <View style={{ gap: 4, marginTop: 8 }}>
                    {chart.targetLines.map((line) => (
                      <View
                        key={`legend-${line.label}`}
                        style={{
                          alignItems: "center",
                          flexDirection: "row",
                          gap: 8,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: line.color,
                            height: 2,
                            width: 18,
                          }}
                        />
                        <ThemedText style={{ fontSize: 12, opacity: 0.78 }}>
                          {line.label}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            )}
          </Card>
        ) : null}
      </ScrollView>

      <AddMeasurementModal
        bpDiastolic={bpDiastolic}
        bpSystolic={bpSystolic}
        diastolicOptions={diastolicOptions}
        exerciseCatalog={exerciseCatalog}
        exerciseCatalogError={exerciseCatalogError}
        exerciseCatalogLoading={exerciseCatalogLoading}
        exerciseMinutes={exerciseMinutes}
        heartRateBpm={heartRateBpm}
        heartRateOptions={heartRateOptions}
        kind={kind}
        measuredDate={measuredDate}
        modalOpen={modalOpen}
        onSave={() => void onSave()}
        openCategories={openCategories}
        saving={saving}
        selectedExercise={selectedExercise}
        selectedExerciseId={selectedExerciseId}
        setBpDiastolic={setBpDiastolic}
        setBpSystolic={setBpSystolic}
        setExerciseMinutes={setExerciseMinutes}
        setHeartRateBpm={setHeartRateBpm}
        setMeasuredDate={setMeasuredDate}
        setModalOpen={setModalOpen}
        setOpenCategories={setOpenCategories}
        setSelectedExerciseId={setSelectedExerciseId}
        setShowDatePicker={setShowDatePicker}
        setShowSleepFromPicker={setShowSleepFromPicker}
        setShowSleepToPicker={setShowSleepToPicker}
        setSleepFromTime={setSleepFromTime}
        setSleepToTime={setSleepToTime}
        setWeightDecimal={setWeightDecimal}
        setWeightValue={setWeightValue}
        showDatePicker={showDatePicker}
        showSleepFromPicker={showSleepFromPicker}
        showSleepToPicker={showSleepToPicker}
        sleepFromTime={sleepFromTime}
        sleepToTime={sleepToTime}
        systolicOptions={systolicOptions}
        exerciseDurationOptions={exerciseDurationOptions}
        weightDecimalOptions={weightDecimalOptions}
        weightOptions={weightOptions}
        weightDecimal={weightDecimal}
        weightUnit={preferredWeightUnit}
        weightValue={weightValue}
      />
    </View>
  );
}

function StepSummary({
  summary,
}: {
  summary: {
    averageSpeedKph: number | null;
    caloriesKcal: number | null;
    distanceMeters: number | null;
    steps: number | null;
  };
}) {
  const items = [
    {
      label: "Steps",
      value: formatStepMetric(summary.steps),
    },
    {
      label: "Distance",
      value: formatDistanceValue(summary.distanceMeters),
    },
    {
      label: "Calories",
      value: formatStepMetric(summary.caloriesKcal, { suffix: "kcal" }),
    },
    {
      label: "Avg speed",
      value: formatStepMetric(summary.averageSpeedKph, {
        digits: 1,
        suffix: "km/h",
      }),
    },
  ];

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 12,
      }}
    >
      {items.map((item) => (
        <View
          key={item.label}
          style={{
            backgroundColor: "#F8FAFC",
            borderColor: "#E2E8F0",
            borderRadius: 10,
            borderWidth: 1,
            minWidth: "47%",
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <ThemedText style={{ fontSize: 12, opacity: 0.72 }}>
            {item.label}
          </ThemedText>
          <ThemedText type="defaultSemiBold" style={{ fontSize: 18 }}>
            {item.value}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}
