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

export default function Dashboard() {
  const router = useRouter();
  const { data, error, isFetching, isLoading, refetch } = useGetDashboardQuery(
    "today",
    {
      refetchOnMountOrArgChange: true,
    },
  );
  const { percentOfGoal, stepsToday } = useStepCount(10000);
  const loading = isLoading && !data;
  const refreshing = isFetching && !!data;
  const errorMessage = toQueryErrorMessage(
    error,
    "We couldn't refresh your dashboard.",
  );

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

          {data?.nutrition.radials?.length ? (
            <>
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

              <Pressable
                style={styles.selectableCard}
                onPress={() => router.push("/(fitness)/fitness-details")}
              >
                <StackedRadialsCard
                  centerLabel="Health"
                  radials={healthRadials}
                  subtitle="Daily activity"
                  title="Health"
                />
              </Pressable>

              <Pressable
                style={styles.selectableCard}
                onPress={() => router.push("/(dashboard)/meds-labs")}
              >
                <Card>
                  <ThemedText type="defaultSemiBold">Meds/Labs</ThemedText>
                  <ThemedText style={styles.helperText}>
                    {data.medications.activeCount} active medications
                  </ThemedText>
                  <ThemedText style={styles.helperText}>
                    {data.labs.recent.length} recent lab results
                  </ThemedText>
                </Card>
              </Pressable>
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <Card>
      <ThemedText type="defaultSemiBold">
        We couldn't load your dashboard
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
      <ThemedText type="defaultSemiBold">Couldn't refresh</ThemedText>
      <ThemedText style={styles.helperText}>{message}</ThemedText>
      <ThemedText style={styles.helperText}>Pull down to retry.</ThemedText>
    </Card>
  );
}
