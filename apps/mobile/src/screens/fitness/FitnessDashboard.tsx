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
import { useStepCount } from "@/hooks/useStepCount";
import { useSyncStepCount } from "@/hooks/useSyncStepCount";
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
  onPress?: () => void;
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

function stepStatusLabel(status: ReturnType<typeof useStepCount>["status"]) {
  switch (status) {
    case "permission-required":
      return "Allow Health Connect access to show today's stored steps.";
    case "permission-denied":
      return "Step access was denied. Tap to allow Health Connect access.";
    case "health-connect-unavailable":
      return "Health Connect is not available on this device.";
    case "health-connect-update-required":
      return "Update Health Connect to read stored steps.";
    case "error":
      return "Could not load step data from Health Connect.";
    default:
      return "Today from Health Connect";
  }
}

function formatStepOrigins(dataOrigins: string[]) {
  if (!dataOrigins.length) return "Today from Health Connect";

  return `Today from Health Connect: ${dataOrigins
    .map(formatHealthConnectOrigin)
    .join(", ")}`;
}

function formatHealthConnectOrigin(origin: string) {
  if (origin.includes("shealth")) return "Samsung Health";
  if (origin.includes("google.android.apps.fitness")) return "Google Fit";
  if (origin.includes("fitbit")) return "Fitbit";
  if (origin.includes("garmin")) return "Garmin";
  if (origin.includes("withings")) return "Withings";
  if (origin.includes("oneplus")) return "OnePlus";

  return origin.split(".").at(-1) ?? origin;
}

function formatOriginTotals(originTotals: Record<string, number>) {
  const entries = Object.entries(originTotals);
  if (!entries.length) return "";

  return entries
    .map(([origin, total]) => `${formatHealthConnectOrigin(origin)} ${total}`)
    .join(", ");
}

function getStepSubtext(
  status: ReturnType<typeof useStepCount>["status"],
  dataOrigins: string[],
) {
  return status === "ready"
    ? formatStepOrigins(dataOrigins)
    : stepStatusLabel(status);
}

export default function FitnessDashboard() {
  const router = useRouter();
  const { data, error, isFetching, isLoading, refetch } =
    useGetLatestMeasurementsQuery(undefined);
  const { data: targetsData } = useGetTargetsQuery("lifestyle");
  const {
    dataOrigins: stepDataOrigins,
    debug: stepDebug,
    percentOfGoal,
    requestAccess,
    status: stepStatus,
    stepsToday,
  } = useStepCount(STEPS_DAILY_TARGET);
  useSyncStepCount(stepsToday, stepStatus === "ready");
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
    const stepProgress =
      percentOfGoal === null ? undefined : Math.round(percentOfGoal * 100);
    const stepsCard: MetricCard = {
      kind: "steps",
      label: "Steps",
      onPress:
        stepStatus === "permission-required" || stepStatus === "permission-denied"
          ? requestAccess
          : undefined,
      progressLabel:
        typeof stepProgress === "number"
          ? `${stepProgress}% of ${stepsTarget.toLocaleString()} daily target`
          : undefined,
      progressPercent: stepProgress,
      subtext: getStepSubtext(stepStatus, stepDataOrigins),
      value:
        typeof stepsToday === "number"
          ? `${Math.round(stepsToday).toLocaleString()} steps`
          : "No step access",
    };

    return [
      stepsCard,
      toCard("exercise", byKind.get("exercise")),
      toCard("blood_pressure", byKind.get("blood_pressure")),
      toCard("sleep", byKind.get("sleep")),
    ];
  }, [
    items,
    percentOfGoal,
    requestAccess,
    stepDataOrigins,
    stepDebug,
    stepStatus,
    stepsTarget,
    stepsToday,
  ]);

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
              onPress={
                card.onPress ??
                (() =>
                  router.push({
                    params: { kind: card.kind, label: card.label },
                    pathname: "/(fitness)/metric-trend",
                  }))
              }
            >
              <Card>
                <ThemedText type="defaultSemiBold">{card.label}</ThemedText>
                <ThemedText style={{ fontSize: 22, fontWeight: "700" }}>
                  {card.value}
                </ThemedText>
                <ThemedText style={{ opacity: 0.7 }}>{card.subtext}</ThemedText>
                {card.kind === "steps" && stepDebug ? (
                  <ThemedText style={{ fontSize: 12, opacity: 0.65 }}>
                    Health Connect debug: aggregate {stepDebug.aggregateTotal}
                    {typeof stepDebug.groupedTotal === "number"
                      ? `, grouped ${stepDebug.groupedTotal}`
                      : stepDebug.groupedError
                        ? ", grouped failed"
                        : ""}
                    {Object.keys(stepDebug.originTotals).length > 0
                      ? `, sources ${formatOriginTotals(stepDebug.originTotals)}`
                      : ""}
                  </ThemedText>
                ) : null}
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
                  {card.onPress
                    ? "Allow step access"
                    : card.kind === "steps"
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
