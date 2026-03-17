import { useMemo } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { HeaderOverflowMenu } from "@/components/header-overflow-menu";
import { ThemedText } from "@/components/themed-text";
import { Card } from "../dashboard/components/Card";
import {
  type MeasurementKind,
  type MeasurementLatest,
  toQueryErrorMessage,
  useGetLatestMeasurementsQuery,
  useGetTargetsQuery,
} from "@/store/services/dashboardApi";

type MetricCard = {
  kind: MeasurementKind;
  label: string;
  progressLabel?: string;
  progressPercent?: number;
  subtext: string;
  value: string;
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

function toCard(
  kind: MeasurementKind,
  doc?: MeasurementLatest,
  stepsTarget: number = STEPS_DAILY_TARGET,
): MetricCard {
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
      subtext: "No reading yet",
      value: "No data",
    };
  }
  if (doc.kind === "steps") {
    const steps =
      typeof doc.count === "number" ? Math.max(0, Math.round(doc.count)) : null;
    const percent =
      steps === null
        ? undefined
        : Math.min(100, Math.round((steps / stepsTarget) * 100));
    return {
      kind: "steps",
      label: "Steps",
      progressLabel:
        steps !== null
          ? `${percent}% of ${stepsTarget.toLocaleString()} daily target`
          : undefined,
      progressPercent: percent,
      subtext: formatDateTime(doc.measuredAt),
      value: steps !== null ? `${steps.toLocaleString()} steps` : "No data",
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
      progressLabel:
        mins !== null
          ? `${percent}% of ${EXERCISE_DAILY_TARGET_MIN} min daily target`
          : undefined,
      progressPercent: percent,
      subtext: formatDateTime(doc.measuredAt),
      value:
        mins !== null && kcal !== null
          ? `${mins} min • ${kcal} kcal`
          : mins !== null
            ? `${mins} min`
            : "No data",
    };
  }
  if (doc.kind === "sleep") {
    return {
      kind: "sleep",
      label: "Sleep",
      subtext: formatDateTime(doc.measuredAt),
      value:
        typeof doc.durationMin === "number"
          ? `${Math.round(doc.durationMin)} min`
          : "No data",
    };
  }
  return {
    kind: "blood_pressure",
    label: "Blood pressure",
    subtext: formatDateTime(doc.measuredAt),
    value:
      typeof doc.systolicMmHg === "number" &&
      typeof doc.diastolicMmHg === "number"
        ? `${Math.round(doc.systolicMmHg)}/${Math.round(doc.diastolicMmHg)} mmHg`
        : "No data",
  };
}

export default function FitnessDashboard() {
  const router = useRouter();
  const { data, error, isFetching, isLoading, refetch } =
    useGetLatestMeasurementsQuery(undefined);
  const { data: targetsData } = useGetTargetsQuery("lifestyle");
  const errorMessage = toQueryErrorMessage(
    error,
    "Failed to load fitness readings",
  );
  const items = data ?? [];
  const loading = isLoading && items.length === 0;
  const refreshing = isFetching && items.length > 0;

  const stepsTarget = useMemo(() => {
    const stepsTargetItem = targetsData?.items.find(
      (item) =>
        item.metric === "steps_per_day" &&
        item.effective &&
        typeof item.effective.value === "number",
    );
    return stepsTargetItem?.effective.value ?? STEPS_DAILY_TARGET;
  }, [targetsData?.items]);

  const cards = useMemo(() => {
    const byKind = new Map(items.map((item) => [item.kind, item]));
    return [
      toCard("steps", byKind.get("steps"), stepsTarget),
      toCard("exercise", byKind.get("exercise")),
      toCard("blood_pressure", byKind.get("blood_pressure")),
      toCard("sleep", byKind.get("sleep")),
    ];
  }, [items, stepsTarget]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refetch} />
        }
      >
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <TouchableOpacity onPress={() => router.back()}>
            <ThemedText style={{ fontWeight: "600" }}>‹ Back</ThemedText>
          </TouchableOpacity>
          <HeaderOverflowMenu
            accessibilityLabel="Open health actions"
            items={[
              {
                id: "edit-targets",
                label: "Edit targets",
                onPress: () =>
                  router.push({
                    params: {
                      domain: "lifestyle",
                      title: "Health targets",
                    },
                    pathname: "/targets",
                  }),
              },
            ]}
          />
        </View>

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
            <ThemedText type="defaultSemiBold">
              Could not load readings
            </ThemedText>
            <ThemedText style={{ opacity: 0.7 }}>{errorMessage}</ThemedText>
            <TouchableOpacity onPress={refetch} style={{ marginTop: 6 }}>
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
                  params: { kind: card.kind, label: card.label },
                  pathname: "/(fitness)/metric-trend",
                })
              }
            >
              <Card>
                <ThemedText type="defaultSemiBold">{card.label}</ThemedText>
                <ThemedText style={{ fontSize: 22, fontWeight: "700" }}>
                  {card.value}
                </ThemedText>
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
                  {card.kind === "steps"
                    ? "View trend"
                    : "View trend and add reading"}
                </ThemedText>
              </Card>
            </TouchableOpacity>
          ))}
      </ScrollView>
    </View>
  );
}
