import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";

import { ThemedText } from "@/components/themed-text";
import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { Card } from "../dashboard/components/Card";

type MeasurementKind = "steps" | "exercise" | "sleep" | "blood_pressure";

type TrendPoint = {
  date: string;
  measuredAt: string;
  value: number | null;
  value2: number | null;
};

type ChartPoint = {
  label: string;
  x: number;
  y: number;
  y2?: number;
};

type ExerciseRefItem = {
  category: string;
  exerciseId: string;
  intensity: "light" | "moderate" | "vigorous";
  met: number;
  name: string;
};

type ExerciseRefCategory = {
  category: string;
  items: ExerciseRefItem[];
};

const CHART_WIDTH = 330;
const CHART_HEIGHT = 210;
const CHART_PAD = 28;

const BP_TARGET_SYSTOLIC = 120;
const BP_TARGET_DIASTOLIC = 80;
const SLEEP_TARGET_MIN = 8 * 60;

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function metricUnit(kind: MeasurementKind) {
  if (kind === "steps") return "steps";
  if (kind === "blood_pressure") return "mmHg";
  if (kind === "exercise") return "kcal";
  return "min";
}

function addLabel(kind: MeasurementKind) {
  if (kind === "exercise") return "Add exercise";
  if (kind === "sleep") return "Add sleep";
  return "Add BP";
}

function formatMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${m}m`;
}

function dateToLocalNoonIso(date: Date) {
  const value = new Date(date);
  value.setHours(12, 0, 0, 0);
  return value.toISOString();
}

function numberRange(min: number, max: number) {
  return Array.from({ length: max - min + 1 }, (_, idx) => min + idx);
}

export default function FitnessMetricTrend() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string; label?: string }>();
  const kind = (params.kind as MeasurementKind) || "steps";
  const label = typeof params.label === "string" ? params.label : "Trend";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
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
  const [sleepHours, setSleepHours] = useState(8);
  const [sleepMinutes, setSleepMinutes] = useState(0);

  const minuteOptions = useMemo(() => numberRange(0, 11).map((n) => n * 5), []);
  const hourOptions = useMemo(() => numberRange(0, 16), []);
  const systolicOptions = useMemo(() => numberRange(90, 220), []);
  const diastolicOptions = useMemo(() => numberRange(50, 140), []);

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
          setOpenCategories({ [firstCategory.category]: true });
        }
        if (firstExercise && !selectedExerciseId) {
          setSelectedExerciseId(firstExercise.exerciseId);
        }
      }
    } catch (err: any) {
      setExerciseCatalogError(
        err?.message ?? "Failed to load exercise reference",
      );
    } finally {
      setExerciseCatalogLoading(false);
    }
  }, [kind, selectedExerciseId]);

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
      (p) => typeof p.value === "number" && Number.isFinite(p.value),
    ) as Array<TrendPoint & { value: number }>;
    if (numeric.length === 0) {
      return {
        hasSecondary: false,
        points: [] as ChartPoint[],
        polyline: "",
        polyline2: "",
        targetLines: [] as Array<{ color: string; label: string; y: number }>,
        yMax: 0,
        yMin: 0,
      };
    }

    const values = numeric.map((p) => p.value);
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

    const yMin = Math.min(
      ...values,
      ...(values2.length ? values2 : []),
      ...targetValues,
    );
    const yMax = Math.max(
      ...values,
      ...(values2.length ? values2 : []),
      ...targetValues,
    );
    const span = Math.max(1, yMax - yMin);
    const xStep =
      numeric.length > 1
        ? (CHART_WIDTH - CHART_PAD * 2) / (numeric.length - 1)
        : 0;

    const toY = (value: number) =>
      CHART_HEIGHT -
      CHART_PAD -
      ((value - yMin) / span) * (CHART_HEIGHT - CHART_PAD * 2);

    const chartPoints = numeric.map((point, index) => {
      const x = CHART_PAD + xStep * index;
      const y = toY(point.value);
      const y2 =
        kind === "blood_pressure" && typeof point.value2 === "number"
          ? toY(point.value2)
          : undefined;
      return { label: formatDate(point.date), x, y, y2 };
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

    return {
      hasSecondary: kind === "blood_pressure",
      points: chartPoints,
      polyline: chartPoints.map((p) => `${p.x},${p.y}`).join(" "),
      polyline2: chartPoints
        .filter((p) => typeof p.y2 === "number")
        .map((p) => `${p.x},${p.y2}`)
        .join(" "),
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

  useEffect(() => {
    setMeasuredDate(new Date());
  }, [kind, modalOpen]);

  async function onSave() {
    if (kind === "steps") return;

    try {
      setSaving(true);
      const payload: Record<string, unknown> = { kind };

      if (kind === "exercise") {
        if (!selectedExercise) {
          throw new Error("Select an exercise type");
        }
        const value = Number(exerciseMinutes);
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error("Enter valid exercise minutes");
        }
        payload.durationMin = Math.round(value);
        payload.exerciseId = selectedExercise.exerciseId;
      }

      if (kind === "sleep") {
        const durationMin = sleepHours * 60 + sleepMinutes;
        payload.durationMin = durationMin;
        payload.measuredAt = dateToLocalNoonIso(measuredDate);
      }

      if (kind === "blood_pressure") {
        if (bpSystolic <= bpDiastolic) {
          throw new Error("Systolic must be greater than diastolic");
        }
        payload.systolicMmHg = bpSystolic;
        payload.diastolicMmHg = bpDiastolic;
        payload.measuredAt = dateToLocalNoonIso(measuredDate);
      }

      const res = await authFetch(`${API}/api/measurements/create`, {
        body: JSON.stringify(payload),
        method: "POST",
      });
      const body: any = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        throw new Error(body?.message ?? "Failed to save reading");
      }

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
          Number.isFinite(latestPoint.value) ? (
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
                <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                  <Line
                    x1={CHART_PAD}
                    x2={CHART_WIDTH - CHART_PAD}
                    y1={CHART_HEIGHT - CHART_PAD}
                    y2={CHART_HEIGHT - CHART_PAD}
                    stroke="rgba(100,116,139,0.6)"
                    strokeWidth={1}
                  />
                  <Line
                    x1={CHART_PAD}
                    x2={CHART_PAD}
                    y1={CHART_PAD}
                    y2={CHART_HEIGHT - CHART_PAD}
                    stroke="rgba(100,116,139,0.6)"
                    strokeWidth={1}
                  />

                  {chart.targetLines.map((line) => (
                    <Line
                      key={line.label}
                      x1={CHART_PAD}
                      x2={CHART_WIDTH - CHART_PAD}
                      y1={line.y}
                      y2={line.y}
                      stroke={line.color}
                      strokeDasharray="6 4"
                      strokeWidth={1.5}
                    />
                  ))}

                  <Polyline
                    points={chart.polyline}
                    fill="none"
                    stroke="#2563EB"
                    strokeWidth={2.5}
                  />
                  {chart.hasSecondary && chart.polyline2 ? (
                    <Polyline
                      points={chart.polyline2}
                      fill="none"
                      stroke="#F97316"
                      strokeWidth={2.5}
                    />
                  ) : null}

                  {chart.points.map((point, idx) => (
                    <Circle
                      key={`${point.x}-${idx}`}
                      cx={point.x}
                      cy={point.y}
                      r={3.5}
                      fill="#2563EB"
                    />
                  ))}
                  {chart.hasSecondary
                    ? chart.points
                        .filter((point) => typeof point.y2 === "number")
                        .map((point, idx) => (
                          <Circle
                            key={`${point.x}-s-${idx}`}
                            cx={point.x}
                            cy={point.y2 as number}
                            r={3.5}
                            fill="#F97316"
                          />
                        ))
                    : null}

                  <SvgText x={6} y={CHART_PAD + 4} fontSize={11} fill="#475569">
                    {chart.yMax.toFixed(0)}
                  </SvgText>
                  <SvgText
                    x={6}
                    y={CHART_HEIGHT - CHART_PAD}
                    fontSize={11}
                    fill="#475569"
                  >
                    {chart.yMin.toFixed(0)}
                  </SvgText>
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

      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: "rgba(15,23,42,0.45)",
            flex: 1,
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: "white",
              borderRadius: 12,
              gap: 10,
              maxWidth: 360,
              padding: 16,
              width: "100%",
            }}
          >
            <ThemedText type="defaultSemiBold">{addLabel(kind)}</ThemedText>

            {kind === "exercise" ? (
              <>
                <ThemedText style={{ fontSize: 12, opacity: 0.8 }}>
                  Exercise type
                </ThemedText>
                {exerciseCatalogLoading ? (
                  <View style={{ alignItems: "center", paddingVertical: 10 }}>
                    <ActivityIndicator />
                  </View>
                ) : null}
                {exerciseCatalogError ? (
                  <ThemedText style={{ color: "#b91c1c", fontSize: 12 }}>
                    {exerciseCatalogError}
                  </ThemedText>
                ) : null}

                <ScrollView style={{ maxHeight: 220 }}>
                  {exerciseCatalog.map((category) => {
                    const isOpen = !!openCategories[category.category];
                    return (
                      <View key={category.category} style={{ marginBottom: 8 }}>
                        <TouchableOpacity
                          onPress={() =>
                            setOpenCategories((prev) => ({
                              ...prev,
                              [category.category]: !isOpen,
                            }))
                          }
                          style={{
                            backgroundColor: "#F1F5F9",
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                          }}
                        >
                          <ThemedText style={{ fontWeight: "700" }}>
                            {isOpen ? "▾" : "▸"} {category.category}
                          </ThemedText>
                        </TouchableOpacity>
                        {isOpen ? (
                          <View style={{ gap: 6, marginTop: 6 }}>
                            {category.items.map((item) => {
                              const isSelected =
                                selectedExerciseId === item.exerciseId;
                              return (
                                <TouchableOpacity
                                  key={item.exerciseId}
                                  onPress={() =>
                                    setSelectedExerciseId(item.exerciseId)
                                  }
                                  style={{
                                    borderColor: isSelected
                                      ? "#2563EB"
                                      : "#CBD5E1",
                                    borderRadius: 8,
                                    borderWidth: 1,
                                    paddingHorizontal: 10,
                                    paddingVertical: 8,
                                  }}
                                >
                                  <ThemedText style={{ fontWeight: "600" }}>
                                    {item.name}
                                  </ThemedText>
                                  <ThemedText
                                    style={{ fontSize: 12, opacity: 0.7 }}
                                  >
                                    {item.met.toFixed(1)} MET • {item.intensity}
                                  </ThemedText>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </ScrollView>

                {selectedExercise ? (
                  <ThemedText style={{ fontSize: 12, opacity: 0.8 }}>
                    Selected: {selectedExercise.name} (
                    {selectedExercise.met.toFixed(1)} MET)
                  </ThemedText>
                ) : null}

                <TextInput
                  value={exerciseMinutes}
                  onChangeText={(text) =>
                    setExerciseMinutes(text.replace(/[^0-9]/g, ""))
                  }
                  placeholder="Duration (minutes)"
                  keyboardType="number-pad"
                  style={{
                    borderColor: "#CBD5E1",
                    borderRadius: 8,
                    borderWidth: 1,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                  }}
                />
              </>
            ) : null}

            {kind === "blood_pressure" ? (
              <>
                <ThemedText style={{ fontSize: 12, opacity: 0.8 }}>
                  Systolic (mmHg)
                </ThemedText>
                <View
                  style={{
                    borderColor: "#CBD5E1",
                    borderRadius: 8,
                    borderWidth: 1,
                  }}
                >
                  <Picker
                    selectedValue={bpSystolic}
                    onValueChange={(value) => setBpSystolic(Number(value))}
                  >
                    {systolicOptions.map((value) => (
                      <Picker.Item
                        key={`sys-${value}`}
                        label={`${value}`}
                        value={value}
                      />
                    ))}
                  </Picker>
                </View>

                <ThemedText style={{ fontSize: 12, opacity: 0.8 }}>
                  Diastolic (mmHg)
                </ThemedText>
                <View
                  style={{
                    borderColor: "#CBD5E1",
                    borderRadius: 8,
                    borderWidth: 1,
                  }}
                >
                  <Picker
                    selectedValue={bpDiastolic}
                    onValueChange={(value) => setBpDiastolic(Number(value))}
                  >
                    {diastolicOptions.map((value) => (
                      <Picker.Item
                        key={`dia-${value}`}
                        label={`${value}`}
                        value={value}
                      />
                    ))}
                  </Picker>
                </View>
              </>
            ) : null}

            {kind === "sleep" ? (
              <>
                <ThemedText style={{ fontSize: 12, opacity: 0.8 }}>
                  Sleep duration
                </ThemedText>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View
                    style={{
                      borderColor: "#CBD5E1",
                      borderRadius: 8,
                      borderWidth: 1,
                      flex: 1,
                    }}
                  >
                    <Picker
                      selectedValue={sleepHours}
                      onValueChange={(value) => setSleepHours(Number(value))}
                    >
                      {hourOptions.map((value) => (
                        <Picker.Item
                          key={`h-${value}`}
                          label={`${value} h`}
                          value={value}
                        />
                      ))}
                    </Picker>
                  </View>
                  <View
                    style={{
                      borderColor: "#CBD5E1",
                      borderRadius: 8,
                      borderWidth: 1,
                      flex: 1,
                    }}
                  >
                    <Picker
                      selectedValue={sleepMinutes}
                      onValueChange={(value) => setSleepMinutes(Number(value))}
                    >
                      {minuteOptions.map((value) => (
                        <Picker.Item
                          key={`m-${value}`}
                          label={`${String(value).padStart(2, "0")} min`}
                          value={value}
                        />
                      ))}
                    </Picker>
                  </View>
                </View>
              </>
            ) : null}

            {kind === "blood_pressure" || kind === "sleep" ? (
              <>
                <ThemedText style={{ fontSize: 12, opacity: 0.8 }}>
                  Date (defaults to today)
                </ThemedText>
                <TouchableOpacity
                  onPress={() => setShowDatePicker(true)}
                  style={{
                    borderColor: "#CBD5E1",
                    borderRadius: 8,
                    borderWidth: 1,
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                  }}
                >
                  <ThemedText>{formatDateLabel(measuredDate)}</ThemedText>
                </TouchableOpacity>
              </>
            ) : null}

            <View
              style={{
                flexDirection: "row",
                gap: 8,
                justifyContent: "flex-end",
              }}
            >
              <TouchableOpacity
                onPress={() => setModalOpen(false)}
                style={{ padding: 8 }}
              >
                <ThemedText style={{ fontWeight: "600" }}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onSave}
                disabled={saving}
                style={{
                  backgroundColor: "#2563EB",
                  borderRadius: 8,
                  opacity: saving ? 0.65 : 1,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <ThemedText style={{ color: "white", fontWeight: "700" }}>
                  {saving ? "Saving..." : "Save"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {showDatePicker ? (
        <DateTimePicker
          value={measuredDate}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          maximumDate={new Date()}
          onChange={(event, selectedDate) => {
            if (Platform.OS !== "ios") {
              setShowDatePicker(false);
            }
            if (event.type === "set" && selectedDate) {
              setMeasuredDate(selectedDate);
            }
          }}
        />
      ) : null}
    </View>
  );
}
