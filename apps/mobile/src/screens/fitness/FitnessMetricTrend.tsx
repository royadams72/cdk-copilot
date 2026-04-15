import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Svg, { Line, Rect, Text as SvgText } from "react-native-svg";

import { TrendLineChart } from "@/components/charts/TrendLineChart";
import { ThemedText } from "@/components/themed-text";
import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { CreateMeasurementArgs } from "@/store/services/types";
import { Card } from "../dashboard/components/Card";
import { useCreateMeasurementMutation } from "@/store/services/dashboardApi";
import { AddMeasurementModal } from "./AddMeasurementModal";
import type {
  ChartPoint,
  DayEntry,
  ExerciseRefCategory,
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
  formatDateLabel,
  formatDayLabel,
  formatMinutes,
  formatTimeLabel,
  formatYAxisValue,
  GROUP_GAP,
  metricUnit,
  numberRange,
  SLEEP_TARGET_MIN,
  SLOT_GAP,
} from "./metricTrendUtils";

export default function FitnessMetricTrend() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string; label?: string }>();
  const kind = (params.kind as MeasurementKind) || "steps";
  const label = typeof params.label === "string" ? params.label : "Trend";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [entriesByDate, setEntriesByDate] = useState<
    Record<string, DayEntry[]>
  >({});
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSleepFromPicker, setShowSleepFromPicker] = useState(false);
  const [showSleepToPicker, setShowSleepToPicker] = useState(false);
  const [measuredDate, setMeasuredDate] = useState(new Date());

  const [exerciseMinutes, setExerciseMinutes] = useState("");
  const [exerciseCatalog, setExerciseCatalog] = useState<ExerciseRefCategory[]>(
    [],
  );
  const [exerciseCatalogLoading, setExerciseCatalogLoading] = useState(false);
  const [exerciseCatalogError, setExerciseCatalogError] = useState<
    string | null
  >(null);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(
    {},
  );
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>("");

  const [bpSystolic, setBpSystolic] = useState(BP_TARGET_SYSTOLIC);
  const [bpDiastolic, setBpDiastolic] = useState(BP_TARGET_DIASTOLIC);
  const [heartRateBpm, setHeartRateBpm] = useState(72);
  const [createMeasurement] = useCreateMeasurementMutation();
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

  const selectedExercise = useMemo(() => {
    for (const category of exerciseCatalog) {
      const match = category.items.find(
        (item) => item.exerciseId === selectedExerciseId,
      );
      if (match) return match;
    }
    return null;
  }, [exerciseCatalog, selectedExerciseId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(
        `${API}/api/measurements/history?kind=${encodeURIComponent(kind)}`,
        { method: "GET" },
      );
      const body: any = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        throw new Error(body?.message ?? "Failed to load trend");
      }
      setPoints(Array.isArray(body.data?.points) ? body.data.points : []);
      setEntriesByDate(
        body.data?.entriesByDate && typeof body.data.entriesByDate === "object"
          ? (body.data.entriesByDate as Record<string, DayEntry[]>)
          : {},
      );
    } catch (err: any) {
      setError(err?.message ?? "Failed to load trend");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  const loadExerciseCatalog = useCallback(async () => {
    if (kind !== "exercise") return;
    setExerciseCatalogLoading(true);
    setExerciseCatalogError(null);
    try {
      const res = await authFetch(
        `${API}/api/measurements/exercise-reference`,
        {
          method: "GET",
        },
      );
      const body: any = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        throw new Error(body?.message ?? "Failed to load exercise reference");
      }

      const categories = Array.isArray(body.data?.categories)
        ? (body.data.categories as ExerciseRefCategory[])
        : [];
      setExerciseCatalog(categories);

      if (categories.length) {
        const firstCategory = categories[0];
        const firstExercise = firstCategory.items?.[0];
        if (firstCategory) {
          setOpenCategories((prev) =>
            Object.keys(prev).length
              ? prev
              : { [firstCategory.category]: true },
          );
        }
        if (firstExercise) {
          setSelectedExerciseId((prev) => prev || firstExercise.exerciseId);
        }
      }
    } catch (err: any) {
      setExerciseCatalogError(
        err?.message ?? "Failed to load exercise reference",
      );
    } finally {
      setExerciseCatalogLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (kind === "exercise") {
      loadExerciseCatalog();
    }
  }, [kind, loadExerciseCatalog]);

  const chart = useMemo(() => {
    const numeric = points.filter(
      (p) =>
        typeof (kind === "exercise" ? p.value2 : p.value) === "number" &&
        Number.isFinite(kind === "exercise" ? p.value2 : p.value),
    );
    if (numeric.length === 0) {
      return {
        chartWidth: CHART_WIDTH,
        points: [] as ChartPoint[],
        targetLines: [] as Array<{ color: string; label: string; y: number }>,
        yMax: 0,
        yMin: 0,
      };
    }

    const values = numeric
      .map((p) => (kind === "exercise" ? (p.value2 as number) : p.value))
      .filter((v): v is number => v !== null);
    const values2 =
      kind === "blood_pressure"
        ? numeric
            .map((p) => (typeof p.value2 === "number" ? p.value2 : null))
            .filter((v): v is number => v !== null)
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
    const byDate = new Map(points.map((p) => [p.date, p]));
    for (
      let cursor = firstDate;
      cursor.getTime() <= lastDate.getTime();
      cursor = addDays(cursor, 1)
    ) {
      const key = dateKey(cursor);
      const found = byDate.get(key);
      dailyPoints.push(
        found ?? {
          date: key,
          measuredAt: `${key}T12:00:00.000Z`,
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

    const targetLines: Array<{ color: string; label: string; y: number }> = [];
    if (kind === "blood_pressure") {
      targetLines.push({
        color: "#2563EB",
        label: `Target systolic ${BP_TARGET_SYSTOLIC}`,
        y: toY(BP_TARGET_SYSTOLIC),
      });
      targetLines.push({
        color: "#F97316",
        label: `Target diastolic ${BP_TARGET_DIASTOLIC}`,
        y: toY(BP_TARGET_DIASTOLIC),
      });
    }
    if (kind === "sleep") {
      targetLines.push({
        color: "#0F766E",
        label: `Target ${formatMinutes(SLEEP_TARGET_MIN)}`,
        y: toY(SLEEP_TARGET_MIN),
      });
    }
    if (kind === "exercise") {
      targetLines.push({
        color: "#0F766E",
        label: `Target ${EXERCISE_TARGET_MIN} min`,
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
  }, [points, kind]);

  const latestPoint = useMemo(() => {
    const numeric = points.filter(
      (p) => typeof p.value === "number" && Number.isFinite(p.value),
    );
    return numeric.length ? numeric[numeric.length - 1] : null;
  }, [points]);

  const selectedChartPoint = useMemo(() => {
    if (selectedBarIndex === null) return null;
    if (selectedBarIndex < 0 || selectedBarIndex >= chart.points.length)
      return null;
    return chart.points[selectedBarIndex];
  }, [chart.points, selectedBarIndex]);

  const selectedDateKey = selectedChartPoint
    ? selectedChartPoint.date
    : (chart.points[chart.points.length - 1]?.date ?? null);
  const selectedDayEntries = useMemo(() => {
    if (!selectedDateKey) return [];
    const entries = entriesByDate[selectedDateKey] ?? [];
    return entries
      .slice()
      .sort((a, b) =>
        a.measuredAt === b.measuredAt
          ? 0
          : a.measuredAt < b.measuredAt
            ? 1
            : -1,
      );
  }, [entriesByDate, selectedDateKey]);

  useEffect(() => {
    setMeasuredDate(new Date());
    setShowSleepFromPicker(false);
    setShowSleepToPicker(false);
  }, [kind, modalOpen]);

  useEffect(() => {
    setSelectedBarIndex(null);
  }, [kind, points, entriesByDate]);

  async function onSave() {
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
      } else {
        return;
      }

      await createMeasurement(payload).unwrap();

      setExerciseMinutes("");
      setModalOpen(false);
      await load();
    } catch (err: any) {
      Alert.alert("Save failed", err?.message ?? "Could not save reading");
    } finally {
      setSaving(false);
    }
  }

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
            Daily readings trend ({metricUnit(kind)})
          </ThemedText>
          {kind === "exercise" &&
          latestPoint &&
          typeof latestPoint.value === "number" &&
          Number.isFinite(latestPoint.value) &&
          latestPoint.value > 0 ? (
            <ThemedText style={{ opacity: 0.7 }}>
              Latest burn: {Math.round(latestPoint.value)} kcal
              {typeof latestPoint?.value2 === "number"
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
            <TouchableOpacity onPress={load}>
              <ThemedText style={{ fontWeight: "700" }}>Retry</ThemedText>
            </TouchableOpacity>
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
                <View style={{ position: "relative" }}>
                  <View
                    pointerEvents="none"
                    style={{
                      backgroundColor: "white",
                      bottom: 0,
                      justifyContent: "space-between",
                      left: 0,
                      paddingBottom: CHART_PAD - 2,
                      paddingTop: CHART_PAD + 4,
                      position: "absolute",
                      top: 0,
                      width: CHART_PAD,
                      zIndex: 1,
                    }}
                  >
                    <View
                      style={{
                        backgroundColor: "rgba(100,116,139,0.6)",
                        bottom: CHART_PAD,
                        left: CHART_PAD - 1,
                        position: "absolute",
                        top: CHART_PAD,
                        width: 1,
                      }}
                    />
                    <ThemedText style={{ color: "#475569", fontSize: 11 }}>
                      {formatYAxisValue(kind, chart.yMax)}
                    </ThemedText>
                    <ThemedText style={{ color: "#475569", fontSize: 11 }}>
                      {formatYAxisValue(kind, chart.yMin)}
                    </ThemedText>
                  </View>
                  <ScrollView
                    horizontal
                    nestedScrollEnabled
                    showsHorizontalScrollIndicator={false}
                  >
                    {kind === "blood_pressure" ? (
                      <TrendLineChart
                        width={chart.chartWidth}
                        height={CHART_HEIGHT}
                        padding={{
                          bottom: CHART_PAD,
                          left: CHART_PAD,
                          right: CHART_PAD,
                          top: CHART_PAD,
                        }}
                        selectedIndex={selectedBarIndex}
                        onSelectIndex={setSelectedBarIndex}
                        lineColor="rgba(100,116,139,0.6)"
                        labelColor="#475569"
                        gridRatios={[0.25, 0.5, 0.75]}
                        targets={chart.targetLines.map((line) => ({
                          id: line.label,
                          color: line.color,
                          y: line.y,
                        }))}
                        series={[
                          {
                            id: "systolic",
                            color: "#2563EB",
                            points: chart.points.map((point, idx) => ({
                              index: idx,
                              visible: point.hasValue,
                              x: point.x,
                              y: point.y,
                            })),
                          },
                          {
                            id: "diastolic",
                            color: "#F97316",
                            points: chart.points.map((point, idx) => ({
                              index: idx,
                              visible: typeof point.y2 === "number",
                              x: point.x,
                              y: typeof point.y2 === "number" ? point.y2 : 0,
                            })),
                          },
                        ]}
                        xLabels={chart.points.map((point, idx) => ({
                          index: idx,
                          label: point.label,
                          x: point.x,
                        }))}
                      />
                    ) : (
                      <Svg width={chart.chartWidth} height={CHART_HEIGHT}>
                        <Line
                          x1={CHART_PAD}
                          x2={chart.chartWidth - CHART_PAD}
                          y1={CHART_HEIGHT - CHART_PAD}
                          y2={CHART_HEIGHT - CHART_PAD}
                          stroke="rgba(100,116,139,0.6)"
                          strokeWidth={1}
                        />

                        {chart.targetLines.map((line) => (
                          <Line
                            key={line.label}
                            x1={CHART_PAD}
                            x2={chart.chartWidth - CHART_PAD}
                            y1={line.y}
                            y2={line.y}
                            stroke={line.color}
                            strokeDasharray="6 4"
                            strokeWidth={1.5}
                          />
                        ))}

                        {chart.points.map((point, idx) => (
                          <Rect
                            key={`${point.x}-bar-${idx}`}
                            x={point.barX}
                            y={point.y}
                            width={BAR_WIDTH}
                            height={
                              point.hasValue
                                ? Math.max(
                                    1,
                                    CHART_HEIGHT - CHART_PAD - point.y,
                                  )
                                : 0
                            }
                            fill="#2563EB"
                            opacity={
                              point.hasValue &&
                              (selectedBarIndex === null ||
                                selectedBarIndex === idx)
                                ? 1
                                : point.hasValue
                                  ? 0.55
                                  : 0
                            }
                            onPress={() => setSelectedBarIndex(idx)}
                            rx={3}
                          />
                        ))}

                        {chart.points.map((point, idx) => (
                          <SvgText
                            key={`t-${point.x}-${idx}`}
                            x={point.x}
                            y={CHART_HEIGHT - 8}
                            textAnchor="middle"
                            fontSize={10}
                            fill="#475569"
                          >
                            {point.label}
                          </SvgText>
                        ))}
                      </Svg>
                    )}
                  </ScrollView>
                </View>

                {selectedDateKey ? (
                  <View
                    style={{
                      gap: 8,
                      marginTop: 10,
                    }}
                  >
                    <View>
                      <ThemedText style={{ fontSize: 12, opacity: 0.72 }}>
                        {formatDateLabel(
                          new Date(`${selectedDateKey}T12:00:00`),
                        )}
                      </ThemedText>
                    </View>
                    <View style={{ gap: 8 }}>
                      {selectedDayEntries.length === 0 ? (
                        <Card style={{ borderRadius: 10, padding: 10 }}>
                          <ThemedText style={{ fontSize: 13, opacity: 0.72 }}>
                            No readings for this day.
                          </ThemedText>
                        </Card>
                      ) : (
                        selectedDayEntries.map((entry, idx) => {
                          const time = formatTimeLabel(entry.measuredAt);
                          if (kind === "blood_pressure") {
                            const sys =
                              typeof entry.value === "number"
                                ? Math.round(entry.value)
                                : null;
                            const dia =
                              typeof entry.value2 === "number"
                                ? Math.round(entry.value2)
                                : null;
                            return (
                              <Card
                                key={`${entry.measuredAt}-${idx}`}
                                style={{
                                  borderRadius: 10,
                                  gap: 3,
                                  padding: 10,
                                }}
                              >
                                <ThemedText
                                  type="defaultSemiBold"
                                  style={{ fontSize: 18 }}
                                >
                                  {sys ?? "--"}/{dia ?? "--"} mmHg
                                </ThemedText>
                                <ThemedText
                                  style={{ fontSize: 12, opacity: 0.72 }}
                                >
                                  {time}
                                </ThemedText>
                              </Card>
                            );
                          }

                          if (kind === "heart_rate") {
                            const bpm =
                              typeof entry.value === "number"
                                ? Math.round(entry.value)
                                : null;
                            return (
                              <Card
                                key={`${entry.measuredAt}-${idx}`}
                                style={{
                                  borderRadius: 10,
                                  gap: 3,
                                  padding: 10,
                                }}
                              >
                                <ThemedText
                                  type="defaultSemiBold"
                                  style={{ fontSize: 18 }}
                                >
                                  {bpm ?? "--"} bpm
                                </ThemedText>
                                <ThemedText
                                  style={{ fontSize: 12, opacity: 0.72 }}
                                >
                                  {time}
                                </ThemedText>
                              </Card>
                            );
                          }

                          if (kind === "exercise") {
                            const kcal =
                              typeof entry.value === "number"
                                ? Math.round(entry.value)
                                : null;
                            const mins =
                              typeof entry.value2 === "number"
                                ? Math.round(entry.value2)
                                : null;
                            const name =
                              entry.exerciseTitle?.trim() ||
                              entry.exerciseName?.trim() ||
                              "Exercise";
                            return (
                              <Card
                                key={`${entry.measuredAt}-${idx}`}
                                style={{
                                  borderRadius: 10,
                                  gap: 3,
                                  padding: 10,
                                }}
                              >
                                <ThemedText type="defaultSemiBold">
                                  {name}
                                </ThemedText>
                                <ThemedText
                                  style={{ fontSize: 12, opacity: 0.72 }}
                                >
                                  {time}
                                </ThemedText>
                                <ThemedText style={{ fontSize: 13 }}>
                                  {mins !== null ? `${mins} min` : "-- min"}
                                  {kcal !== null && kcal > 0
                                    ? ` • ${kcal} kcal`
                                    : ""}
                                </ThemedText>
                              </Card>
                            );
                          }

                          if (kind === "sleep") {
                            const mins =
                              typeof entry.value === "number"
                                ? Math.round(entry.value)
                                : null;
                            const fromTime = entry.sleepFromAt
                              ? formatTimeLabel(entry.sleepFromAt)
                              : "--:--";
                            const toTime = entry.sleepToAt
                              ? formatTimeLabel(entry.sleepToAt)
                              : "--:--";
                            return (
                              <Card
                                key={`${entry.measuredAt}-${idx}`}
                                style={{
                                  borderRadius: 10,
                                  gap: 3,
                                  padding: 10,
                                }}
                              >
                                <ThemedText type="defaultSemiBold">
                                  {time}
                                </ThemedText>
                                <ThemedText
                                  style={{ fontSize: 12, opacity: 0.72 }}
                                >
                                  From {fromTime}
                                </ThemedText>
                                <ThemedText style={{ fontSize: 13 }}>
                                  To {toTime}
                                </ThemedText>
                                <ThemedText
                                  style={{ fontSize: 12, opacity: 0.72 }}
                                >
                                  {mins !== null ? formatMinutes(mins) : "--"}
                                </ThemedText>
                              </Card>
                            );
                          }

                          const steps =
                            typeof entry.value === "number"
                              ? Math.round(entry.value).toLocaleString()
                              : "--";
                          return (
                            <Card
                              key={`${entry.measuredAt}-${idx}`}
                              style={{ borderRadius: 10, gap: 3, padding: 10 }}
                            >
                              <ThemedText type="defaultSemiBold">
                                Steps
                              </ThemedText>
                              <ThemedText
                                style={{ fontSize: 12, opacity: 0.72 }}
                              >
                                {time}
                              </ThemedText>
                              <ThemedText style={{ fontSize: 13 }}>
                                {steps} steps
                              </ThemedText>
                            </Card>
                          );
                        })
                      )}
                    </View>
                  </View>
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
        onSave={onSave}
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
        showDatePicker={showDatePicker}
        showSleepFromPicker={showSleepFromPicker}
        showSleepToPicker={showSleepToPicker}
        sleepFromTime={sleepFromTime}
        sleepToTime={sleepToTime}
        systolicOptions={systolicOptions}
      />
    </View>
  );
}
