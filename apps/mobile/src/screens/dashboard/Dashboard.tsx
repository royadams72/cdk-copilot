import { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
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
import {
  useGetPendingPatientEngagementQuery,
  useOpenPatientEngagementMutation,
} from "@/store/services/patientEngagementApi";

import { styles } from "./styles";
import { Card } from "./components/Card";
import { StackedRadialsCard } from "./components/StackedRadials";
import { describeRange } from "./utils";
import { DashboardRadial } from "./types";

export default function Dashboard() {
  const router = useRouter();
  const { data, error, isFetching, isLoading, refetch } = useGetDashboardQuery(
    "today",
    {
      refetchOnMountOrArgChange: true,
    },
  );
  const { data: pendingEngagement } = useGetPendingPatientEngagementQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const [openPatientEngagement, { isLoading: isOpeningEngagement }] =
    useOpenPatientEngagementMutation();
  const loading = isLoading && !data;
  const refreshing = isFetching && !!data;
  const errorMessage = toQueryErrorMessage(
    error,
    "We couldn't refresh your dashboard.",
  );

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

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
    () => [
      {
        id: "steps",
        actual: null,
        label: "Steps",
        percent: null,
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
    [],
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
                subtitle="Health sync temporarily unavailable"
                title="Health"
              />
            </Pressable>

            <Card>
              <ThemedText type="defaultSemiBold">Health sync</ThemedText>
              <ThemedText style={styles.helperText}>
                Health Connect sync is temporarily disabled while the dashboard
                startup crash is being isolated.
              </ThemedText>
            </Card>

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
