import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { Card } from "../dashboard/components/Card";
import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";

type MeasurementKind = "steps" | "exercise" | "sleep" | "blood_pressure";

type MeasurementLatest = {
  kind: MeasurementKind;
  measuredAt?: string;
  count?: number;
  durationMin?: number;
  exercise?: {
    caloriesKcal?: number;
    durationMin?: number;
    name?: string;
  };
  systolicMmHg?: number;
  diastolicMmHg?: number;
};

type MetricCard = {
  kind: MeasurementKind;
  label: string;
  value: string;
  subtext: string;
  progressPercent?: number;
  progressLabel?: string;
};

const STEPS_DAILY_TARGET = 10000;
const EXERCISE_DAILY_TARGET_MIN = 30;

function formatDateTime(value?: string) {
  if (!value) return "No reading yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No reading yet";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}

function toCard(kind: MeasurementKind, doc?: MeasurementLatest): MetricCard {
  if (!doc) {
    return {
      kind,
      label:
        kind === "blood_pressure"
          ? "Blood pressure"
          : kind === "exercise"
            ? "Exercise"
            : kind === "sleep"
              ? "Sleep"
              : "Steps",
      value: "No data",
      subtext: "No reading yet",
    };
  }
  if (doc.kind === "steps") {
    const steps = typeof doc.count === "number" ? Math.max(0, Math.round(doc.count)) : null;
    const percent =
      steps === null ? undefined : Math.min(100, Math.round((steps / STEPS_DAILY_TARGET) * 100));
    return {
      kind: "steps",
      label: "Steps",
      value: steps !== null ? `${steps.toLocaleString()} steps` : "No data",
      subtext: formatDateTime(doc.measuredAt),
      progressPercent: percent,
      progressLabel:
        steps !== null ? `${percent}% of ${STEPS_DAILY_TARGET.toLocaleString()} daily target` : undefined,
    };
  }
  if (doc.kind === "exercise") {
    const mins =
      typeof doc.exercise?.durationMin === "number"
        ? Math.max(0, Math.round(doc.exercise.durationMin))
        : typeof doc.durationMin === "number"
          ? Math.max(0, Math.round(doc.durationMin))
        : null;
    const kcal =
      typeof doc.exercise?.caloriesKcal === "number"
        ? Math.max(0, Math.round(doc.exercise.caloriesKcal))
        : null;
    const percent =
      mins === null
        ? undefined
        : Math.min(100, Math.round((mins / EXERCISE_DAILY_TARGET_MIN) * 100));
    return {
      kind: "exercise",
      label: "Exercise",
      value:
        mins !== null && kcal !== null
          ? `${mins} min • ${kcal} kcal`
          : mins !== null
            ? `${mins} min`
            : "No data",
      subtext: formatDateTime(doc.measuredAt),
      progressPercent: percent,
      progressLabel:
        mins !== null ? `${percent}% of ${EXERCISE_DAILY_TARGET_MIN} min daily target` : undefined,
    };
  }
  if (doc.kind === "sleep") {
    return {
      kind: "sleep",
      label: "Sleep",
      value:
        typeof doc.durationMin === "number"
          ? `${Math.round(doc.durationMin)} min`
          : "No data",
      subtext: formatDateTime(doc.measuredAt),
    };
  }
  return {
    kind: "blood_pressure",
    label: "Blood pressure",
    value:
      typeof doc.systolicMmHg === "number" &&
      typeof doc.diastolicMmHg === "number"
        ? `${Math.round(doc.systolicMmHg)}/${Math.round(doc.diastolicMmHg)} mmHg`
        : "No data",
    subtext: formatDateTime(doc.measuredAt),
  };
}

export default function FitnessDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<MeasurementLatest[]>([]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/api/measurements/latest`, {
        method: "GET",
      });
      const body: any = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        throw new Error(body?.message ?? "Failed to load fitness readings");
      }
      setItems(Array.isArray(body.data) ? body.data : []);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load fitness readings");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cards = useMemo(() => {
    const byKind = new Map(items.map((item) => [item.kind, item]));
    return [
      toCard("steps", byKind.get("steps")),
      toCard("exercise", byKind.get("exercise")),
      toCard("blood_pressure", byKind.get("blood_pressure")),
      toCard("sleep", byKind.get("sleep")),
    ];
  }, [items]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      <TouchableOpacity onPress={() => router.back()}>
        <ThemedText style={{ fontWeight: "600" }}>‹ Back</ThemedText>
      </TouchableOpacity>

      <View style={{ gap: 4 }}>
        <ThemedText type="title">Fitness dashboard</ThemedText>
        <ThemedText style={{ opacity: 0.72 }}>
          Latest readings for activity, blood pressure, and sleep.
        </ThemedText>
      </View>

      {loading ? (
        <View style={{ alignItems: "center", gap: 10, paddingVertical: 28 }}>
          <ActivityIndicator size="large" />
          <ThemedText>Loading readings...</ThemedText>
        </View>
      ) : null}

      {error ? (
        <Card>
          <ThemedText type="defaultSemiBold">Could not load readings</ThemedText>
          <ThemedText style={{ opacity: 0.7 }}>{error}</ThemedText>
          <TouchableOpacity onPress={() => load()} style={{ marginTop: 6 }}>
            <ThemedText style={{ fontWeight: "700" }}>Retry</ThemedText>
          </TouchableOpacity>
        </Card>
      ) : null}

      {!loading &&
        cards.map((card) => (
          <TouchableOpacity
            key={card.kind}
            onPress={() =>
              router.push({
                pathname: "/(fitness)/metric-trend",
                params: { kind: card.kind, label: card.label },
              })
            }
          >
            <Card>
              <ThemedText type="defaultSemiBold">{card.label}</ThemedText>
              <ThemedText style={{ fontSize: 22, fontWeight: "700" }}>{card.value}</ThemedText>
              <ThemedText style={{ opacity: 0.7 }}>{card.subtext}</ThemedText>
              {typeof card.progressPercent === "number" ? (
                <View style={{ gap: 6, marginTop: 8 }}>
                  <View
                    style={{
                      backgroundColor: "#E2E8F0",
                      borderRadius: 999,
                      height: 8,
                      overflow: "hidden",
                      width: "100%",
                    }}
                  >
                    <View
                      style={{
                        backgroundColor: "#38BDF8",
                        borderRadius: 999,
                        height: "100%",
                        width: `${card.progressPercent}%`,
                      }}
                    />
                  </View>
                  <ThemedText style={{ fontSize: 12, opacity: 0.75 }}>
                    {card.progressLabel}
                  </ThemedText>
                </View>
              ) : null}
              <ThemedText style={{ fontSize: 12, opacity: 0.65 }}>
                {card.kind === "steps" ? "View trend" : "View trend and add reading"}
              </ThemedText>
            </Card>
          </TouchableOpacity>
        ))}
    </ScrollView>
  );
}
