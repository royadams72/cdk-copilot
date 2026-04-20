import { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useRouter } from "expo-router";
import {
  toQueryErrorMessage,
  useGetDashboardQuery,
} from "@/store/services/dashboardApi";

import { styles } from "./styles";
import { Card } from "./components/Card";
import { StackedRadialsCard } from "./components/StackedRadials";
import { describeRange } from "./utils";
import { DashboardRadial } from "./types";
import { useStepCount } from "@/hooks/useStepCount";
import { useSyncStepCount } from "@/hooks/useSyncStepCount";
import { useSyncHealthConnectMeasurements } from "@/hooks/useSyncHealthConnectMeasurements";

export default function Dashboard() {
  const router = useRouter();
  const { data, error, isFetching, isLoading, refetch } = useGetDashboardQuery(
    "today",
    {
      refetchOnMountOrArgChange: true,
    },
  );
  const {
    missingHealthPermissions,
    percentOfGoal,
    requestAccess,
    status: stepStatus,
    stepsToday,
  } = useStepCount(10000);
  useSyncStepCount(stepsToday, stepStatus === "ready");
  useSyncHealthConnectMeasurements(true);
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
  }, [refetch]);

  const rangeSummary = useMemo(() => {
    if (!data) return "";
    return describeRange(data.nutrition.range);
  }, [data]);

  const healthRadials = useMemo<DashboardRadial[]>(
    () => [
      {
        id: "steps",
        actual: stepsToday,
        label: "Steps",
        percent: percentOfGoal,
        target: 10000,
        unit: "steps",
      },
      {
        id: "minutes-exercise",
        actual: null,
        label: "Minutes exercise",
        percent: null,
        target: 30,
        unit: "min",
      },
      {
        id: "calories-burned",
        actual: null,
        label: "Calories burned",
        percent: null,
        target: 500,
        unit: "kcal",
      },
    ],
    [percentOfGoal, stepsToday],
  );

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

          {error && data && <InlineError message={errorMessage} />}

          <>
            {data?.nutrition.radials?.length ? (
              <Pressable
                style={styles.selectableCard}
                onPress={() => router.push("/(nutrition)/nutrition-details")}
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
                  Health Connect setup
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
                      void requestAccess();
                    }}
                  >
                    <ThemedText style={styles.primaryActionText}>
                      {hasMissingHealthPermissions
                        ? "Allow more Health Connect access"
                        : "Allow step access"}
                    </ThemedText>
                  </Pressable>
                )}
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
      return "Connect Health Connect";
    case "permission-denied":
      return "Step access denied";
    case "health-connect-unavailable":
      return "Health Connect unavailable";
    case "health-connect-update-required":
      return "Update Health Connect";
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
    return "Steps are connected, but Health Connect access for heart rate, exercise, sleep, or blood pressure is still missing. Allow the remaining access so those readings can sync too.";
  }

  switch (stepStatus) {
    case "permission-required":
      return "Grant Health Connect access so the app can read phone or watch steps, heart rate, exercise, sleep, and blood pressure after the app has been closed.";
    case "permission-denied":
      return "Health Connect access was denied. Allow it to show stored phone or watch health readings on the dashboard.";
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
