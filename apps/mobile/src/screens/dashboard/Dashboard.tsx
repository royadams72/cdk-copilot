import { useCallback, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useRouter } from "expo-router";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchDashboard,
  selectDashboardData,
  selectDashboardError,
  selectDashboardScope,
  selectDashboardStatus,
} from "@/store/slices/dashboardSlice";

import { styles } from "./styles";
import { Card } from "./components/Card";
import { StackedRadialsCard } from "./components/StackedRadials";
import { describeRange } from "./utils";
import { DashboardRadial } from "./types";
import { useStepCount } from "@/hooks/useStepCount";

export default function Dashboard() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectDashboardData);
  const status = useAppSelector(selectDashboardStatus);
  const error = useAppSelector(selectDashboardError);
  const scope = useAppSelector(selectDashboardScope);
  const { percentOfGoal, stepsToday } = useStepCount(10000);
  const loading = status === "loading" && !data;
  const refreshing = status === "loading" && !!data;

  useEffect(() => {
    if ((status === "idle" && !data) || scope !== "today") {
      dispatch(fetchDashboard({ scope: "today" }));
    }
  }, [data, dispatch, scope, status]);

  const handleRefresh = useCallback(() => {
    dispatch(fetchDashboard({ scope: "today" }));
  }, [dispatch]);

  const rangeSummary = useMemo(() => {
    if (!data) return "";
    return describeRange(data.nutrition.range);
  }, [data]);

  const healthRadials = useMemo<DashboardRadial[]>(
    () => [
      {
        id: "steps",
        label: "Steps",
        unit: "steps",
        actual: stepsToday,
        target: 10000,
        percent: percentOfGoal,
      },
      {
        id: "minutes-exercise",
        label: "Minutes exercise",
        unit: "min",
        actual: null,
        target: 30,
        percent: null,
      },
      {
        id: "calories-burned",
        label: "Calories burned",
        unit: "kcal",
        actual: null,
        target: 500,
        percent: null,
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

  const showBlockingError = status === "failed" && !data && !!error;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {showBlockingError && error ? (
        <ErrorState message={error} />
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

          {status === "failed" && error && data && (
            <InlineError message={error} />
          )}

          {data?.nutrition.radials?.length ? (
            <>
              <Pressable
                style={styles.selectableCard}
                onPress={() => router.push("/(nutrition)/nutrition-details")}
              >
                <StackedRadialsCard
                  centerLabel="Nutrition"
                  radials={data.nutrition.radials}
                  subtitle="Weekly intake"
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

export function ErrorState({
  message,
}: {
  message: string;
}) {
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
