import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";

import { useStepCount } from "@/hooks/useStepCount";
import { useSyncHealthConnectMeasurements } from "@/hooks/useSyncHealthConnectMeasurements";
import { useSyncStepCount } from "@/hooks/useSyncStepCount";
import { getCurrentHealthSyncProvider } from "@/lib/currentHealthSyncProvider";
import { syncSleepReminderNotification } from "@/lib/pushNotifications";
import {
  detectInstalledFitnessApps,
  formatFitnessAppName,
  type KnownFitnessApp,
} from "@/lib/fitnessApps";
import { ThemedText } from "@/components/themed-text";
import { Card } from "../dashboard/components/Card";
import { buildFitnessSetupGuidance } from "@/lib/fitnessSetupState";
import {
  type MeasurementKind,
  toQueryErrorMessage,
  useGetTargetsQuery,
} from "@/store/services/dashboardApi";
import { useGetLatestMeasurementsQuery } from "@/store/services/measurementsApi";
import type { MeasurementLatest } from "@/store/services/types";
import { useGetCurrentUserSettingsQuery } from "@/store/services/userApi";
import {
  formatSleepHours,
  formatWeightValue,
  weightUnitFromUserUnits,
} from "./metricTrendUtils";

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

function healthProviderName() {
  return Platform.OS === "ios" ? "Apple Health" : "Health Connect";
}
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
  weightDisplayUnit: "kg" | "lb" = "kg",
): MetricCard {
  if (!doc) {
    return {
      kind,
      label:
        kind === "blood_pressure"
          ? "Blood pressure"
          : kind === "heart_rate"
            ? "Heart rate"
            : kind === "exercise"
              ? "Exercise"
              : kind === "sleep"
                ? "Sleep"
                : kind === "weight"
                  ? "Weight"
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
        mins !== null && kcal !== null && kcal > 0
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
          ? formatSleepHours(doc.durationMin)
          : "No data",
    };
  }
  if (doc.kind === "weight") {
    return {
      kind: "weight",
      label: "Weight",
      subtext: formatDateTime(doc.measuredAt),
      value:
        typeof doc.valueKg === "number"
          ? formatWeightValue(doc.valueKg, weightDisplayUnit)
          : "No data",
    };
  }
  if (doc.kind === "heart_rate") {
    return {
      kind: "heart_rate",
      label: "Heart rate",
      subtext: formatDateTime(doc.measuredAt),
      value:
        typeof doc.bpm === "number" ? `${Math.round(doc.bpm)} bpm` : "No data",
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
      return Platform.OS === "ios"
        ? "Allow Apple Health access to show iPhone or Apple Watch health readings. If the prompt does not appear, open the Health app, go to Sharing or Data Access for CKD Copilot, and enable the categories you want to share."
        : "Allow Health Connect access to show phone or watch health readings.";
    case "permission-denied":
      return Platform.OS === "ios"
        ? "Apple Health access still looks incomplete. Open the Health app, go to Sharing or Data Access for CKD Copilot, and review the categories you want to share."
        : "Health Connect access was denied. Tap to allow stored health readings.";
    case "health-connect-unavailable":
      return "Health Connect is not available on this device.";
    case "health-connect-update-required":
      return "Update Health Connect to read stored steps.";
    case "error":
      return `Could not load step data from ${healthProviderName()}.`;
    default:
      return `Today from ${healthProviderName()}`;
  }
}

function formatStepOrigins(dataOrigins: string[]) {
  if (!dataOrigins.length) return `Today from ${healthProviderName()}`;

  return `Today from ${healthProviderName()}: ${dataOrigins
    .map(formatHealthConnectOrigin)
    .join(", ")}`;
}

function formatHealthConnectOrigin(origin: string) {
  return formatFitnessAppName(origin);
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
  hasMissingHealthPermissions: boolean,
) {
  if (status === "ready" && hasMissingHealthPermissions) {
    return Platform.OS === "ios"
      ? "Steps are connected. Allow more Apple Health access for heart rate, workout sessions, sleep, and blood pressure."
      : "Steps are connected. Allow more Health Connect access for heart rate, exercise, sleep, and blood pressure.";
  }

  return status === "ready"
    ? formatStepOrigins(dataOrigins)
    : stepStatusLabel(status);
}

function getFitnessHealthSetupMessage(
  stepStatus: ReturnType<typeof useStepCount>["status"],
  hasMissingHealthPermissions: boolean,
  backgroundReadGranted: boolean,
) {
  if (stepStatus === "ready" && !backgroundReadGranted) {
    return Platform.OS === "ios"
      ? "Background sync is not yet enabled. Enable Apple Health background delivery so data can sync while the app is closed. If access still looks incomplete, open the Health app and review Sharing or Data Access for CKD Copilot."
      : "Background sync is not yet enabled. In Health Connect, open CKD Copilot, scroll to Additional access, and allow background reading so data syncs while the app is closed.";
  }

  if (hasMissingHealthPermissions && stepStatus === "ready") {
    return Platform.OS === "ios"
      ? "Steps are connected, but Apple Health access for heart rate, workout sessions, sleep, or blood pressure is still missing. Allow the remaining access so those readings can sync too."
      : "Steps are connected, but Health Connect access for heart rate, exercise, sleep, or blood pressure is still missing. Allow the remaining access so those readings can sync too.";
  }

  switch (stepStatus) {
    case "permission-required":
      return Platform.OS === "ios"
        ? "Grant Apple Health access so the app can read steps, heart rate, workout sessions, sleep, and blood pressure from your iPhone or Apple Watch. If the prompt does not appear, open the Health app, go to Sharing or Data Access for CKD Copilot, and enable the categories you want to share."
        : "Grant Health Connect access so the app can read phone or watch steps, heart rate, exercise, sleep, and blood pressure after the app has been closed.";
    case "permission-denied":
      return Platform.OS === "ios"
        ? "Apple Health access still looks incomplete. Open the Health app, go to Sharing or Data Access for CKD Copilot, and turn on steps, heart rate, workout sessions, sleep, and blood pressure. Then return here and try again."
        : "Health Connect access was denied. Allow it to show stored phone or watch health readings on the dashboard.";
    case "health-connect-unavailable":
      return "Health Connect is not available on this device. On Android 13 and below, install Health Connect first.";
    case "health-connect-update-required":
      return "Health Connect needs an update before this app can read steps.";
    case "unsupported":
      return "Step tracking is not supported on this device.";
    default:
      return "We couldn't load stored step data right now.";
  }
}

export default function FitnessDashboard() {
  const router = useRouter();
  const [installedFitnessApps, setInstalledFitnessApps] = useState<
    KnownFitnessApp[]
  >([]);
  const { data, error, isFetching, isLoading, refetch } =
    useGetLatestMeasurementsQuery(undefined);
  const { data: currentUserSettings } = useGetCurrentUserSettingsQuery();
  const { data: targetsData } = useGetTargetsQuery("lifestyle");
  const {
    backgroundReadGranted,
    dataOrigins: stepDataOrigins,
    debug: stepDebug,
    hasAnyMeasurementAccess,
    missingHealthPermissions,
    openAppSettings,
    openHealthAccessSettings,
    percentOfGoal,
    requestAccess,
    requestBackgroundReadAccess,
    status: stepStatus,
    stepsToday,
  } = useStepCount(STEPS_DAILY_TARGET);
  useSyncStepCount(stepsToday, stepStatus === "ready");
  useSyncHealthConnectMeasurements(
    stepStatus === "ready" || hasAnyMeasurementAccess,
  );
  const errorMessage = toQueryErrorMessage(
    error,
    "Failed to load fitness readings",
  );

  useEffect(() => {
    if (!data) return;
    void syncSleepReminderNotification();
  }, [data]);
  const items = data ?? [];
  const loading = isLoading && items.length === 0;
  const refreshing = isFetching && items.length > 0;
  const hasMissingHealthPermissions = missingHealthPermissions.length > 0;
  const weightDisplayUnit = weightUnitFromUserUnits(
    currentUserSettings?.units ?? "metric",
  );

  useEffect(() => {
    let mounted = true;

    const loadInstalledApps = async () => {
      const apps = await detectInstalledFitnessApps();
      if (mounted) {
        setInstalledFitnessApps(apps);
      }
    };

    void loadInstalledApps();

    return () => {
      mounted = false;
    };
  }, []);

  const handleTriggerBackgroundTask = async () => {
    try {
      const triggered = await getCurrentHealthSyncProvider()?.triggerBackgroundSyncNow();
      Alert.alert(
        triggered ? "Background task triggered" : "Background task unavailable",
        triggered
          ? `The ${healthProviderName()} background sync path was triggered for testing.`
          : "Background task testing is unavailable on this build or device.",
      );
    } catch (error) {
      Alert.alert(
        "Background task failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  };

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
        stepStatus === "permission-required" ||
        stepStatus === "permission-denied" ||
        hasMissingHealthPermissions
          ? requestAccess
          : undefined,
      progressLabel:
        typeof stepProgress === "number"
          ? `${stepProgress}% of ${stepsTarget.toLocaleString()} daily target`
          : undefined,
      progressPercent: stepProgress,
      subtext: getStepSubtext(
        stepStatus,
        stepDataOrigins,
        hasMissingHealthPermissions,
      ),
      value:
        typeof stepsToday === "number"
          ? `${Math.round(stepsToday).toLocaleString()} steps`
          : "No step access",
    };

    return [
      stepsCard,
      toCard("weight", byKind.get("weight"), stepsTarget, weightDisplayUnit),
      toCard(
        "heart_rate",
        byKind.get("heart_rate"),
        stepsTarget,
        weightDisplayUnit,
      ),
      toCard(
        "exercise",
        byKind.get("exercise"),
        stepsTarget,
        weightDisplayUnit,
      ),
      toCard(
        "blood_pressure",
        byKind.get("blood_pressure"),
        stepsTarget,
        weightDisplayUnit,
      ),
      toCard("sleep", byKind.get("sleep"), stepsTarget, weightDisplayUnit),
    ];
  }, [
    currentUserSettings?.units,
    items,
    percentOfGoal,
    requestAccess,
    hasMissingHealthPermissions,
    stepDataOrigins,
    stepDebug,
    stepStatus,
    stepsTarget,
    stepsToday,
    weightDisplayUnit,
  ]);

  const fitnessSetupGuidance = useMemo(
    () =>
      buildFitnessSetupGuidance({
        hasMissingHealthPermissions,
        installedApps: installedFitnessApps,
        items,
        stepDataOrigins,
        stepStatus,
      }),
    [
      hasMissingHealthPermissions,
      installedFitnessApps,
      items,
      stepDataOrigins,
      stepStatus,
    ],
  );
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
          <TouchableOpacity
            accessibilityLabel="Open fitness settings"
            onPress={() => router.push("/(fitness)/settings")}
            style={{
              alignItems: "center",
              backgroundColor: "rgba(148,163,184,0.18)",
              borderRadius: 999,
              height: 40,
              justifyContent: "center",
              width: 40,
            }}
          >
            <MaterialIcons color="#0F172A" name="settings" size={22} />
          </TouchableOpacity>
        </View>

        <View style={{ gap: 4 }}>
          <ThemedText type="title">Fitness dashboard</ThemedText>
          <ThemedText style={{ opacity: 0.72 }}>
            Latest readings for weight, heart rate, activity, blood pressure,
            and sleep.
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

        {!loading && fitnessSetupGuidance ? (
          <Card>
            <ThemedText type="defaultSemiBold">
              {fitnessSetupGuidance.title}
            </ThemedText>
            <ThemedText style={{ opacity: 0.7 }}>
              {fitnessSetupGuidance.body}
            </ThemedText>
          </Card>
        ) : null}

        {!loading &&
        (stepStatus === "permission-required" ||
          stepStatus === "permission-denied" ||
          hasMissingHealthPermissions ||
          (stepStatus === "ready" && !backgroundReadGranted)) ? (
          <Card>
            <ThemedText type="defaultSemiBold">
              {stepStatus === "ready" && !backgroundReadGranted
                ? `Allow additional ${healthProviderName()} access`
                : `${healthProviderName()} setup`}
            </ThemedText>
            <ThemedText style={{ opacity: 0.7 }}>
              {getFitnessHealthSetupMessage(
                stepStatus,
                hasMissingHealthPermissions,
                backgroundReadGranted,
              )}
            </ThemedText>
            <TouchableOpacity
              onPress={() => {
                if (stepStatus === "ready" && !backgroundReadGranted) {
                  void requestBackgroundReadAccess();
                  return;
                }
                void (async () => {
                  const result = await requestAccess();
                  if (
                    Platform.OS === "ios" &&
                    result &&
                    (result.status === "permission-required" ||
                      result.status === "permission-denied")
                  ) {
                    Alert.alert(
                      "Apple Health access",
                      "The Apple Health prompt still has not completed. You can try the prompt again, open the Health app for CKD Copilot sharing, or open normal app settings.",
                      [
                        {
                          text: "Try again",
                          onPress: () => {
                            void requestAccess();
                          },
                        },
                        {
                          text: "Open Health app",
                          onPress: () => {
                            void openHealthAccessSettings();
                          },
                        },
                        {
                          text: "Open Settings",
                          onPress: () => {
                            void openAppSettings();
                          },
                        },
                        { text: "Cancel", style: "cancel" },
                      ],
                    );
                  }
                })();
              }}
              style={{ marginTop: 8 }}
            >
              <ThemedText style={{ fontWeight: "700" }}>
                {stepStatus === "ready" && !backgroundReadGranted
                  ? Platform.OS === "ios"
                    ? "Enable Apple Health background sync"
                    : "Open additional health access settings"
                  : hasMissingHealthPermissions
                    ? `Allow more ${healthProviderName()} access`
                  : Platform.OS === "ios"
                      ? "Check Apple Health access"
                      : "Allow Health Connect access"}
              </ThemedText>
            </TouchableOpacity>
          </Card>
        ) : null}

        {!loading && __DEV__ ? (
          <Card>
            <ThemedText type="defaultSemiBold">Dev: Background sync</ThemedText>
            <ThemedText style={{ opacity: 0.7 }}>
              Trigger the native background sync path immediately for testing.
            </ThemedText>
            <ThemedText style={{ opacity: 0.7 }}>
              Background read permission:{" "}
              {backgroundReadGranted ? "granted" : "missing"}
            </ThemedText>
            <TouchableOpacity
              onPress={() => {
                void handleTriggerBackgroundTask();
              }}
              style={{ marginTop: 8 }}
            >
              <ThemedText style={{ fontWeight: "700" }}>
                Run background sync now
              </ThemedText>
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
                    {healthProviderName()} debug: aggregate {stepDebug.aggregateTotal}
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
                    ? hasMissingHealthPermissions
                      ? `Allow more ${healthProviderName()} access`
                      : "Allow step access"
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
