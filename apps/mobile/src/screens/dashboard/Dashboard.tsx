import { useCallback, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
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
import { LabsCard } from "../labs/components/LabsCard";
import { StackedRadialsCard } from "./components/StackedRadials";
import { describeRange } from "./utils";
import { RatioCard } from "./components/RatioCard";
import { MedicationCard } from "./components/MedicationCard";

export default function Dashboard() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectDashboardData);
  const status = useAppSelector(selectDashboardStatus);
  const error = useAppSelector(selectDashboardError);
  const scope = useAppSelector(selectDashboardScope);
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

  const handleRetry = useCallback(() => {
    dispatch(fetchDashboard({ scope: "today" }));
  }, [dispatch]);

  const rangeSummary = useMemo(() => {
    if (!data) return "";
    return describeRange(data.nutrition.range);
  }, [data]);

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
        <ErrorState message={error} onRetry={handleRetry} />
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
            <InlineError message={error} onRetry={handleRetry} />
          )}

          {data?.nutrition.radials?.length ? (
            <>
              <StackedRadialsCard radials={data.nutrition.radials} />
              <TouchableOpacity
                style={styles.detailLink}
                onPress={() => router.push("/(nutrition)/nutrition-details")}
              >
                <ThemedText style={styles.detailLinkText}>
                  Open nutrition details
                </ThemedText>
              </TouchableOpacity>
            </>
          ) : null}

          {data && <RatioCard ratio={data.nutrition.ratio} />}
          {data && (
            <MedicationCard
              medications={data.medications}
              onAdd={() => router.push("/(medications)/add-medication")}
              onEdit={(medicationId) =>
                router.push(`/(medications)/add-medication?id=${medicationId}`)
              }
              onHistory={() => router.push("/(medications)/medication-history")}
            />
          )}

          {data && (
            <LabsCard
              labs={data.labs}
              onAdd={() => router.push("/(labs)/add-labs")}
              onEdit={() => router.push("/(labs)/labs-history?mode=edit")}
              onHistory={() => router.push("/(labs)/labs-history")}
            />
          )}
        </>
      )}
    </ScrollView>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card>
      <ThemedText type="defaultSemiBold">
        We couldn't load your dashboard
      </ThemedText>
      <ThemedText style={styles.helperText}>{message}</ThemedText>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <ThemedText style={styles.retryText}>Try again</ThemedText>
      </TouchableOpacity>
    </Card>
  );
}

function InlineError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card>
      <ThemedText type="defaultSemiBold">Couldn't refresh</ThemedText>
      <ThemedText style={styles.helperText}>{message}</ThemedText>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <ThemedText style={styles.retryText}>Retry</ThemedText>
      </TouchableOpacity>
    </Card>
  );
}
