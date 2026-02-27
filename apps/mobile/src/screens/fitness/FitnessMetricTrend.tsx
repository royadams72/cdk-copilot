import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
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
  value: number;
  value2?: number | null;
};

const CHART_WIDTH = 330;
const CHART_HEIGHT = 210;
const CHART_PAD = 28;

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function metricUnit(kind: MeasurementKind) {
  if (kind === "steps") return "steps";
  if (kind === "blood_pressure") return "mmHg";
  return "min";
}

function addLabel(kind: MeasurementKind) {
  if (kind === "steps") return "Add steps";
  if (kind === "exercise") return "Add exercise";
  if (kind === "sleep") return "Add sleep";
  return "Add BP";
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
  const [input1, setInput1] = useState("");
  const [input2, setInput2] = useState("");

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

  useEffect(() => {
    load();
  }, [load]);

  const chart = useMemo(() => {
    const numeric = points.filter(
      (p) => typeof p.value === "number" && Number.isFinite(p.value),
    ) as Array<TrendPoint & { value: number }>;
    if (numeric.length === 0) {
      return {
        hasSecondary: false,
        polyline: "",
        polyline2: "",
        points: [] as ChartPoint[],
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
    const yMin = Math.min(...values, ...(values2.length ? values2 : [Number.POSITIVE_INFINITY]));
    const yMax = Math.max(...values, ...(values2.length ? values2 : [Number.NEGATIVE_INFINITY]));
    const span = Math.max(1, yMax - yMin);
    const xStep =
      numeric.length > 1 ? (CHART_WIDTH - CHART_PAD * 2) / (numeric.length - 1) : 0;

    const chartPoints = numeric.map((point, index) => {
      const x = CHART_PAD + xStep * index;
      const y =
        CHART_HEIGHT - CHART_PAD - ((point.value - yMin) / span) * (CHART_HEIGHT - CHART_PAD * 2);
      const y2 =
        kind === "blood_pressure" && typeof point.value2 === "number"
          ? CHART_HEIGHT -
            CHART_PAD -
            ((point.value2 - yMin) / span) * (CHART_HEIGHT - CHART_PAD * 2)
          : undefined;
      return { label: formatDate(point.date), value: point.value, value2: point.value2, x, y, y2 };
    });

    return {
      hasSecondary: kind === "blood_pressure",
      points: chartPoints,
      polyline: chartPoints.map((p) => `${p.x},${p.y}`).join(" "),
      polyline2: chartPoints
        .filter((p) => typeof p.y2 === "number")
        .map((p) => `${p.x},${p.y2}`)
        .join(" "),
      yMax,
      yMin,
    };
  }, [points, kind]);

  async function onSave() {
    try {
      setSaving(true);
      const payload: Record<string, unknown> = { kind };
      if (kind === "steps") payload.count = Number(input1);
      if (kind === "exercise" || kind === "sleep") payload.durationMin = Number(input1);
      if (kind === "blood_pressure") {
        payload.systolicMmHg = Number(input1);
        payload.diastolicMmHg = Number(input2);
      }

      const res = await authFetch(`${API}/api/measurements/create`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const body: any = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        throw new Error(body?.message ?? "Failed to save reading");
      }
      setInput1("");
      setInput2("");
      setModalOpen(false);
      await load();
    } catch (err: any) {
      Alert.alert("Save failed", err?.message ?? "Could not save reading");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 28 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedText style={{ fontWeight: "600" }}>‹ Back</ThemedText>
        </TouchableOpacity>

        <View style={{ gap: 4 }}>
          <ThemedText type="title">{label}</ThemedText>
          <ThemedText style={{ opacity: 0.72 }}>
            Daily readings trend ({metricUnit(kind)})
          </ThemedText>
        </View>

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
              <ThemedText style={{ opacity: 0.72 }}>No readings yet.</ThemedText>
            ) : (
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
                <Polyline points={chart.polyline} fill="none" stroke="#2563EB" strokeWidth={2.5} />
                {chart.hasSecondary && chart.polyline2 ? (
                  <Polyline points={chart.polyline2} fill="none" stroke="#F97316" strokeWidth={2.5} />
                ) : null}
                {chart.points.map((point, idx) => (
                  <Circle key={`${point.x}-${idx}`} cx={point.x} cy={point.y} r={3.5} fill="#2563EB" />
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
                <SvgText x={6} y={CHART_HEIGHT - CHART_PAD} fontSize={11} fill="#475569">
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
            )}
          </Card>
        ) : null}
      </ScrollView>

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
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
            <TextInput
              value={input1}
              onChangeText={setInput1}
              placeholder={
                kind === "steps"
                  ? "Steps count"
                  : kind === "blood_pressure"
                    ? "Systolic"
                    : "Duration (minutes)"
              }
              keyboardType="numeric"
              style={{
                borderColor: "#CBD5E1",
                borderRadius: 8,
                borderWidth: 1,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}
            />
            {kind === "blood_pressure" ? (
              <TextInput
                value={input2}
                onChangeText={setInput2}
                placeholder="Diastolic"
                keyboardType="numeric"
                style={{
                  borderColor: "#CBD5E1",
                  borderRadius: 8,
                  borderWidth: 1,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                }}
              />
            ) : null}
            <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
              <TouchableOpacity onPress={() => setModalOpen(false)} style={{ padding: 8 }}>
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
    </View>
  );
}

