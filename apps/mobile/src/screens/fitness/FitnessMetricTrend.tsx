import { useCallback, useEffect, useMemo, useState } from "react";
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
import { toQueryErrorMessage } from "@/store/services/appApi";
import {
  useCreateMeasurementMutation,
  useGetExerciseReferenceQuery,
  useGetMeasurementHistoryQuery,
} from "@/store/services/measurementsApi";
import { useGetCurrentUserSettingsQuery } from "@/store/services/userApi";
import type { CreateMeasurementArgs } from "@/store/services/types";

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
  dateKey,
  dateToMeasuredAtIso,
  EXERCISE_TARGET_MIN,
  formatWeightValue,
  formatDayLabel,
  formatDistanceValue,
  formatStepMetric,
  getStepSummaryFromEntries,
  GROUP_GAP,
  metricUnit,
  numberRange,
  SLEEP_TARGET_MIN,
  SLOT_GAP,
  sortEntriesForTrendDay,
  convertKgToLb,
  convertLbToKg,
  type WeightUnit,
  weightUnitFromUserUnits,
} from "./metricTrendUtils";

type TrendChart = {
  chartWidth: number;
  points: ChartPoint[];
  targetLines: { color: string; label: string; y: number }[];
  yMax: number;
  yMin: number;
};

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
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(
    {},
  );
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [bpSystolic, setBpSystolic] = useState(BP_TARGET_SYSTOLIC);
  const [bpDiastolic, setBpDiastolic] = useState(BP_TARGET_DIASTOLIC);
  const [heartRateBpm, setHeartRateBpm] = useState(72);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("kg");
  const [weightValue, setWeightValue] = useState(70);
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
  const weightKgOptions = useMemo(
    () => Array.from({ length: 441 }, (_, index) => 30 + index * 0.5),
    [],
  );
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
  const preferredWeightUnit = weightUnitFromUserUnits(
    currentUserSettings?.units ?? "metric",
  );
  const weightOptions =
    weightUnit === "lb" ? weightLbOptions : weightKgOptions;

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

  const handleWeightUnitChange = useCallback((nextUnit: WeightUnit) => {
    setWeightUnit((currentUnit) => {
      if (currentUnit === nextUnit) {
        return currentUnit;
      }

      setWeightValue((currentValue) =>
        nextUnit === "lb"
          ? Math.round(convertKgToLb(currentValue))
          : Math.round(convertLbToKg(currentValue) * 10) / 10,
      );

      return nextUnit;
    });
  }, []);

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
        typeof (kind === "exercise" ? point.value2 : point.value) === "number" &&
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
      .map((point) => (kind === "exercise" ? (point.value2 as number) : point.value))
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
        ? Math.min(...values, ...(values2.length ? values2 : []), ...targetValues)
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
      (point) => typeof point.value === "number" && Number.isFinite(point.value),
    );
    return numeric.length ? numeric[numeric.length - 1] : null;
  }, [points]);

  const selectedBarIndex = useMemo(() => {
    if (!selectedDateKey) return null;
    const index = chart.points.findIndex((point) => point.date === selectedDateKey);
    return index >= 0 ? index : null;
  }, [chart.points, selectedDateKey]);

  const selectedDayEntries = useMemo(() => {
    if (!selectedDateKey) return [];
    return sortEntriesForTrendDay(kind, entriesByDate[selectedDateKey] ?? []);
  }, [entriesByDate, kind, selectedDateKey]);

  const selectedStepSummary = useMemo(() => {
    if (kind !== "steps") return null;
    return getStepSummaryFromEntries(selectedDayEntries);
  }, [kind, selectedDayEntries]);

  const isSelectedToday = useMemo(() => {
    if (!selectedDateKey) {
      return false;
    }
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(now.getDate()).padStart(2, "0")}`;
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
      steps: selectedStepSummary.steps ?? healthConnectStepSummary?.steps ?? null,
    } satisfies StepActivitySummary;
  }, [healthConnectStepSummary, kind, selectedStepSummary]);

  const heartRateHourlyValues = useMemo(() => {
    if (kind !== "heart_rate") {
      return [];
    }
    return buildHeartRateHourlyValues(selectedDayEntries);
  }, [kind, selectedDayEntries]);

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
    setWeightUnit(preferredWeightUnit);
    setWeightValue(preferredWeightUnit === "lb" ? 154 : 70);
    setShowSleepFromPicker(false);
    setShowSleepToPicker(false);
  }, [kind, modalOpen, preferredWeightUnit]);

  useEffect(() => {
    if (kind !== "weight") {
      return;
    }

    setWeightUnit((currentUnit) => {
      if (currentUnit === preferredWeightUnit) {
        return currentUnit;
      }

      setWeightValue((currentValue) =>
        preferredWeightUnit === "lb"
          ? Math.round(convertKgToLb(currentValue))
          : Math.round(convertLbToKg(currentValue) * 10) / 10,
      );

      return preferredWeightUnit;
    });
  }, [kind, preferredWeightUnit]);

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
        const value = Number(weightValue);
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error("Enter a valid weight");
        }
        payload = {
          kind: "weight",
          measuredAt: dateToMeasuredAtIso(measuredDate),
          valueKg:
            weightUnit === "lb"
              ? Math.round(convertLbToKg(value) * 10) / 10
              : Math.round(value * 10) / 10,
        };
      } else {
        return;
      }

      await createMeasurement(payload).unwrap();
      setExerciseMinutes("");
      setModalOpen(false);
      await refetchHistory();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not save reading";
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
    weightUnit,
    weightValue,
    createMeasurement,
    refetchHistory,
  ]);

  const showAdd = kind !== "steps";

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 28 }}>
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
              Latest: {formatWeightValue(latestPoint.value, preferredWeightUnit)}
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
          <ThemedText style={{ opacity: 0.7 }}>
            Steps are synced from your phone/watch.
          </ThemedText>
        )}

        {refreshing ? (
          <ThemedText style={{ opacity: 0.6 }}>Refreshing latest readings…</ThemedText>
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

        {!loading && !error ? (
          <Card>
            {chart.points.length === 0 ? (
              <ThemedText style={{ opacity: 0.72 }}>No readings yet.</ThemedText>
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
                        ? chart.points[index]?.date ?? null
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
                  ) : isSelectedToday && (resolvedStepSummary?.steps ?? 0) > 0 ? (
                    <ThemedText style={{ marginTop: 14, opacity: 0.66 }}>
                      Hourly step breakdown is unavailable for this source.
                    </ThemedText>
                  ) : !isSelectedToday && (resolvedStepSummary?.steps ?? 0) > 0 ? (
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
                      typeof value === "number" ? `${Math.round(value)} bpm` : "--"
                    }
                    label="Hourly heart rate"
                    values={heartRateHourlyValues}
                  />
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
        setWeightUnit={handleWeightUnitChange}
        setWeightValue={setWeightValue}
        showDatePicker={showDatePicker}
        showSleepFromPicker={showSleepFromPicker}
        showSleepToPicker={showSleepToPicker}
        sleepFromTime={sleepFromTime}
        sleepToTime={sleepToTime}
        systolicOptions={systolicOptions}
        weightOptions={weightOptions}
        weightUnit={weightUnit}
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
