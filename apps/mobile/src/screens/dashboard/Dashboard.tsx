import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useRouter } from "expo-router";
import { APP_ROUTES } from "@/constants/routes";
import { getLastViewedCarePlanAt } from "@/lib/carePlans";
import {
  toQueryErrorMessage,
  useGetDashboardQuery,
} from "@/store/services/dashboardApi";
import { useGetCarePlansQuery } from "@/store/services/carePlanApi";
import {
  useGetPendingPatientEngagementQuery,
  useOpenPatientEngagementMutation,
} from "@/store/services/patientEngagementApi";

import { styles } from "./styles";
import { Card } from "./components/Card";
import { StackedRadialsCard } from "./components/StackedRadials";
import { describeRange } from "./utils";
import { DashboardRadial } from "./types";
import { useStepCount } from "@/hooks/useStepCount";
import { useSyncHealthConnectMeasurements } from "@/hooks/useSyncHealthConnectMeasurements";
import { useSyncStepCount } from "@/hooks/useSyncStepCount";
import { getCurrentHealthSyncProvider } from "@/lib/currentHealthSyncProvider";
import { useGetMeasurementHistoryQuery } from "@/store/services/measurementsApi";

const EXERCISE_DAILY_TARGET_MIN = 30;
const EXERCISE_DAILY_TARGET_KCAL = 500;

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function healthProviderName() {
  return Platform.OS === "ios" ? "Apple Health" : "Health Connect";
}

function formatMembershipEndDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function Dashboard() {
  const router = useRouter();
  const { data, error, isFetching, isLoading, refetch } = useGetDashboardQuery(
    "today",
    {
      refetchOnMountOrArgChange: true,
    },
  );
  const {
    backgroundReadGranted,
    hasAnyMeasurementAccess,
    missingHealthPermissions,
    openAppSettings,
    openHealthAccessSettings,
    requestAccess,
    requestBackgroundReadAccess,
    status: stepStatus,
    stepSummary,
    stepsToday,
  } = useStepCount(10000);
  useSyncStepCount(stepsToday, stepStatus === "ready");
  useSyncHealthConnectMeasurements(
    stepStatus === "ready" || hasAnyMeasurementAccess,
  );
  const {
    data: exerciseHistory,
    refetch: refetchExerciseHistory,
  } = useGetMeasurementHistoryQuery("exercise");
  const { data: pendingEngagement } = useGetPendingPatientEngagementQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const {
    data: carePlanData,
    refetch: refetchCarePlans,
  } = useGetCarePlansQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const [openPatientEngagement, { isLoading: isOpeningEngagement }] =
    useOpenPatientEngagementMutation();
  const [showCarePlanBanner, setShowCarePlanBanner] = useState(false);
  const loading = isLoading && !data;
  const refreshing = isFetching && !!data;
  const errorMessage = toQueryErrorMessage(
    error,
    "We couldn't refresh your dashboard.",
  );
  const healthSubtitle = getHealthSubtitle(stepStatus);
  const hasMissingHealthPermissions = missingHealthPermissions.length > 0;

  const handleRefresh = useCallback(() => {
    refetch();
    void refetchCarePlans();
    void refetchExerciseHistory();
  }, [refetch, refetchCarePlans, refetchExerciseHistory]);

  const handleTriggerBackgroundTask = useCallback(() => {
    void (async () => {
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
    })();
  }, []);

  const handleOpenEngagement = useCallback(() => {
    if (!pendingEngagement?.key) return;

    const title = pendingEngagement.metadata?.copy?.title ?? "Achievement unlocked";
    const body =
      pendingEngagement.metadata?.copy?.body ??
      "You earned a new patient engagement achievement.";

    Alert.alert(title, body, [
      {
        onPress: () => {
          void openPatientEngagement({ key: pendingEngagement.key });
        },
        text: "Nice",
      },
    ]);
  }, [openPatientEngagement, pendingEngagement]);

  const rangeSummary = useMemo(() => {
    if (!data) return "";
    return describeRange(data.nutrition.range);
  }, [data]);

  const healthRadials = useMemo<DashboardRadial[]>(
    () => {
      const todayExercise = exerciseHistory?.points.find(
        (point) => point.date === localDateKey(new Date()),
      );
      const caloriesBurned =
        typeof stepSummary?.caloriesKcal === "number"
          ? Math.max(0, Math.round(stepSummary.caloriesKcal))
          : null;
      const exerciseMinutes =
        typeof todayExercise?.value2 === "number"
          ? Math.max(0, Math.round(todayExercise.value2))
          : null;

      return [
        {
          id: "steps",
          actual: stepsToday,
          label: "Steps",
          percent: stepsToday === null ? null : stepsToday / 10000,
          target: 10000,
          unit: "steps",
        },
        {
          id: "minutes-exercise",
          actual: exerciseMinutes,
          label: "Minutes exercise",
          percent:
            exerciseMinutes === null
              ? null
              : exerciseMinutes / EXERCISE_DAILY_TARGET_MIN,
          target: EXERCISE_DAILY_TARGET_MIN,
          unit: "min",
        },
        {
          id: "calories-burned",
          actual: caloriesBurned,
          label: "Calories burned",
          percent:
            caloriesBurned === null
              ? null
              : caloriesBurned / EXERCISE_DAILY_TARGET_KCAL,
          target: EXERCISE_DAILY_TARGET_KCAL,
          unit: "kcal",
        },
      ];
    },
    [exerciseHistory?.points, stepSummary?.caloriesKcal, stepsToday],
  );

  useEffect(() => {
    let cancelled = false;

    async function syncBanner() {
      const latest = carePlanData?.latestUpdatedPlan;
      if (!latest?.updatedAt) {
        if (!cancelled) setShowCarePlanBanner(false);
        return;
      }

      const stored = await getLastViewedCarePlanAt();
      if (!stored) {
        const recentlyUpdated =
          Date.now() - new Date(latest.updatedAt).getTime() < 1000 * 60 * 60 * 72;
        if (!cancelled) setShowCarePlanBanner(recentlyUpdated);
        return;
      }

      if (!cancelled) {
        setShowCarePlanBanner(
          new Date(latest.updatedAt).getTime() > new Date(stored).getTime(),
        );
      }
    }

    void syncBanner();
    return () => {
      cancelled = true;
    };
  }, [carePlanData?.latestUpdatedPlan]);
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <ThemedText style={styles.helperText}>
          Loading your dashboard...
        </ThemedText>
      </View>
    );
  }

  const showBlockingError = !!error && !data;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {showBlockingError ? (
        <ErrorState message={errorMessage} />
      ) : (
        <>
          <View style={styles.header}>
            <ThemedText type="title">Your dashboard</ThemedText>
            {data?.summary.ckdStage && (
              <ThemedText style={styles.subtleText}>
                CKD stage {data.summary.ckdStage.toUpperCase()}
              </ThemedText>
            )}
            {rangeSummary ? (
              <ThemedText style={styles.subtleText}>{rangeSummary}</ThemedText>
            ) : null}
          </View>

          {data?.membership.computedStatus === "endingSoon" ? (
            <Card style={styles.membershipNoticeCard}>
              <ThemedText type="defaultSemiBold">
                Access ending soon
              </ThemedText>
              <ThemedText style={styles.helperText}>
                {data.membership.endsAt
                  ? `Your access is due to end on ${formatMembershipEndDate(
                      data.membership.endsAt,
                    )}.`
                  : "Your current access window is due to end soon."}
              </ThemedText>
              <ThemedText style={styles.helperText}>
                Keep following your care plan and contact your clinic if you think your access should continue.
              </ThemedText>
            </Card>
          ) : null}

          {showCarePlanBanner && carePlanData?.latestUpdatedPlan ? (
            <Card style={styles.carePlanNotificationCard}>
              <ThemedText type="defaultSemiBold">
                {carePlanData.latestUpdatedPlan.reviewDue
                  ? "Care plan review due"
                  : carePlanData.latestUpdatedPlan.status === "completed"
                  ? "Care plan completed"
                  : "New care plan update"}
              </ThemedText>
              <ThemedText style={styles.helperText}>
                {carePlanData.latestUpdatedPlan.title}
              </ThemedText>
              <Pressable
                style={[styles.primaryActionButton, styles.carePlanViewButton]}
                onPress={() =>
                  router.push(
                    (carePlanData.latestUpdatedPlan?.reviewDue
                      ? `/(dashboard)/care-plan-review?id=${carePlanData.latestUpdatedPlan.id}`
                      : `/(dashboard)/care-plan?id=${carePlanData.latestUpdatedPlan!.id}`) as never,
                  )
                }
              >
                <ThemedText style={styles.primaryActionText}>
                  {carePlanData.latestUpdatedPlan.reviewDue
                    ? "Review now"
                    : carePlanData.latestUpdatedPlan.status === "completed"
                    ? "Review completion"
                    : "View care plan"}
                </ThemedText>
              </Pressable>
            </Card>
          ) : null}

          {error && data && <InlineError message={errorMessage} />}

          {carePlanData?.latestActivePlan ? (
            <Card
              style={carePlanData.latestActivePlan.reviewDue ? styles.carePlanReviewCard : undefined}
            >
              <ThemedText type="defaultSemiBold">Care plan</ThemedText>
              <ThemedText style={styles.helperText}>
                {carePlanData.latestActivePlan.title}
              </ThemedText>
              <ThemedText style={styles.helperText}>
                {carePlanData.latestActivePlan.taskCount} active task
                {carePlanData.latestActivePlan.taskCount === 1 ? "" : "s"}
                {carePlanData.latestActivePlan.reviewLabelDisplay
                  ? ` · Review in ${carePlanData.latestActivePlan.reviewLabelDisplay}`
                  : ""}
              </ThemedText>
              {carePlanData.latestActivePlan.reviewDue ? (
                <ThemedText style={styles.helperText}>
                  Your care team would like a quick check-in on how this plan is going.
                </ThemedText>
              ) : null}
              <Pressable
                style={[
                  carePlanData.latestActivePlan.reviewDue
                    ? styles.primaryActionButton
                    : styles.secondaryActionButton,
                  styles.carePlanViewButton,
                ]}
                onPress={() =>
                  router.push(
                    (carePlanData.latestActivePlan?.reviewDue
                      ? `/(dashboard)/care-plan-review?id=${carePlanData.latestActivePlan.id}`
                      : "/(dashboard)/care-plans") as never,
                  )
                }
              >
                <ThemedText
                  style={
                    carePlanData.latestActivePlan.reviewDue
                      ? styles.primaryActionText
                      : styles.secondaryActionText
                  }
                >
                  {carePlanData.latestActivePlan.reviewDue ? "Review care plan" : "All care plans"}
                </ThemedText>
              </Pressable>
            </Card>
          ) : null}

          {pendingEngagement ? (
            <Card>
              <ThemedText type="defaultSemiBold">
                {pendingEngagement.metadata?.copy?.title ?? "Achievement unlocked"}
              </ThemedText>
              <ThemedText style={styles.helperText}>
                {pendingEngagement.metadata?.copy?.body ??
                  "You earned a new engagement milestone."}
              </ThemedText>
              <Pressable
                disabled={isOpeningEngagement}
                style={styles.primaryActionButton}
                onPress={handleOpenEngagement}
              >
                <ThemedText style={styles.primaryActionText}>
                  {isOpeningEngagement ? "Opening..." : "View achievement"}
                </ThemedText>
              </Pressable>
            </Card>
          ) : null}

          <>
            {data?.nutrition.radials?.length ? (
              <Pressable
                style={styles.selectableCard}
                onPress={() => router.push(APP_ROUTES.nutritionDetails)}
              >
                <StackedRadialsCard
                  centerLabel="Nutrition"
                  radials={data.nutrition.radials}
                  subtitle="Today's intake"
                  title="Nutrition"
                />
              </Pressable>
            ) : null}

            <Pressable
              style={styles.selectableCard}
              onPress={() => router.push("/(fitness)/fitness-details")}
            >
              <StackedRadialsCard
                centerLabel="Health"
                radials={healthRadials}
                subtitle={healthSubtitle}
                title="Health"
              />
            </Pressable>

            {stepStatus !== "idle" &&
            (stepStatus !== "ready" || hasMissingHealthPermissions) ? (
              <Card>
                <ThemedText type="defaultSemiBold">
                  {healthProviderName()} setup
                </ThemedText>
                <ThemedText style={styles.helperText}>
                  {getHealthStatusMessage(
                    stepStatus,
                    hasMissingHealthPermissions,
                  )}
                </ThemedText>
                {(stepStatus === "permission-required" ||
                  stepStatus === "permission-denied" ||
                  hasMissingHealthPermissions) && (
                  <Pressable
                    style={styles.primaryActionButton}
                    onPress={() => {
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
                  >
                    <ThemedText style={styles.primaryActionText}>
                      {hasMissingHealthPermissions
                          ? `Allow more ${healthProviderName()} access`
                          : Platform.OS === "ios"
                            ? "Check Apple Health access"
                            : "Allow step access"}
                    </ThemedText>
                  </Pressable>
                )}
              </Card>
            ) : null}

            {stepStatus === "ready" && !backgroundReadGranted ? (
              <Card>
                <ThemedText type="defaultSemiBold">
                  Background {healthProviderName()} sync
                </ThemedText>
                <ThemedText style={styles.helperText}>
                  {Platform.OS === "ios"
                    ? "Enable Apple Health background delivery if you want steps, exercise, sleep, heart rate, and blood pressure to sync when the app is not open. If health access was previously denied, also review CKD Copilot in the Health app and iPhone Settings."
                    : "Allow background Health access if you want steps, exercise, sleep, heart rate, and blood pressure to sync when the app is not open."}
                </ThemedText>
                <Pressable
                  style={styles.primaryActionButton}
                  onPress={() => {
                    void requestBackgroundReadAccess();
                  }}
                >
                  <ThemedText style={styles.primaryActionText}>
                    {Platform.OS === "ios"
                      ? "Enable background health sync"
                      : "Allow background health access"}
                  </ThemedText>
                </Pressable>
                {__DEV__ ? (
                  <ThemedText style={styles.helperText}>
                    Debug: background read permission is missing.
                  </ThemedText>
                ) : null}
              </Card>
            ) : null}

            {__DEV__ ? (
              <Card>
                <ThemedText type="defaultSemiBold">
                  Dev: Background sync
                </ThemedText>
                <ThemedText style={styles.helperText}>
                  Trigger the native background sync path immediately for testing.
                </ThemedText>
                <ThemedText style={styles.helperText}>
                  Background read permission:{" "}
                  {backgroundReadGranted ? "granted" : "missing"}
                </ThemedText>
                <Pressable
                  style={styles.primaryActionButton}
                  onPress={handleTriggerBackgroundTask}
                >
                  <ThemedText style={styles.primaryActionText}>
                    Run background sync now
                  </ThemedText>
                </Pressable>
              </Card>
            ) : null}

            <Pressable
              style={styles.selectableCard}
              onPress={() => router.push("/(dashboard)/meds-labs")}
            >
              <Card>
                <ThemedText type="defaultSemiBold">Meds/Labs</ThemedText>
                <ThemedText style={styles.helperText}>
                  {data?.medications.activeCount ?? 0} active medications
                </ThemedText>
                <ThemedText style={styles.helperText}>
                  {data?.labs.recent.length ?? 0} recent lab results
                </ThemedText>
              </Card>
            </Pressable>
          </>
        </>
      )}
    </ScrollView>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <Card>
      <ThemedText type="defaultSemiBold">
        We couldn&apos;t load your dashboard
      </ThemedText>
      <ThemedText style={styles.helperText}>{message}</ThemedText>
      <ThemedText style={styles.helperText}>
        Pull down to refresh and try again.
      </ThemedText>
    </Card>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <Card>
      <ThemedText type="defaultSemiBold">Couldn&apos;t refresh</ThemedText>
      <ThemedText style={styles.helperText}>{message}</ThemedText>
      <ThemedText style={styles.helperText}>Pull down to retry.</ThemedText>
    </Card>
  );
}

function getHealthSubtitle(stepStatus: ReturnType<typeof useStepCount>["status"]) {
  switch (stepStatus) {
    case "ready":
      return "Today's step total";
    case "permission-required":
      return Platform.OS === "ios" ? "Connect Apple Health" : "Connect Health Connect";
    case "permission-denied":
      return "Step access denied";
    case "health-connect-unavailable":
      return Platform.OS === "ios" ? "Apple Health unavailable" : "Health Connect unavailable";
    case "health-connect-update-required":
      return Platform.OS === "ios" ? "Update Apple Health access" : "Update Health Connect";
    case "error":
      return "Couldn't load step data";
    default:
      return "Daily activity";
  }
}

function getHealthStatusMessage(
  stepStatus: ReturnType<typeof useStepCount>["status"],
  hasMissingHealthPermissions = false,
) {
  if (hasMissingHealthPermissions && stepStatus === "ready") {
    return Platform.OS === "ios"
      ? "Steps are connected, but Apple Health access for heart rate, exercise, sleep, or blood pressure is still missing. Allow the remaining access so those readings can sync too."
      : "Steps are connected, but Health Connect access for heart rate, exercise, sleep, or blood pressure is still missing. Allow the remaining access so those readings can sync too.";
  }

  switch (stepStatus) {
    case "permission-required":
      return Platform.OS === "ios"
        ? "Grant Apple Health access so the app can read steps, heart rate, exercise, sleep, and blood pressure from your iPhone or Apple Watch. If the prompt does not appear, open the Health app, go to Sharing or Data Access for CKD Copilot, and enable the categories you want to share."
        : "Grant Health Connect access so the app can read phone or watch steps, heart rate, exercise, sleep, and blood pressure after the app has been closed.";
    case "permission-denied":
      return Platform.OS === "ios"
        ? "Apple Health access still looks incomplete. Open the Health app, go to Sharing or Data Access for CKD Copilot, and turn on steps, heart rate, exercise, sleep, and blood pressure. Then return here and try again."
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
