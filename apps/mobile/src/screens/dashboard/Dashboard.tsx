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
  selectDashboardData,
  selectDashboardError,
  selectDashboardStatus,
} from "@/store/selectors";
import { fetchDashboard } from "@/store/slices/dashboardSlice";
import { styles } from "./styles";
import { Card } from "./copmonents/Card";
import { LabsCard } from "./copmonents/LabsCard";
import { StackedRadialsCard } from "./copmonents/SatckedRadials";
import { describeRange } from "./utils";
import { RatioCard } from "./copmonents/RadioCard";

export default function Dashboard() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectDashboardData);
  const status = useAppSelector(selectDashboardStatus);
  const error = useAppSelector(selectDashboardError);
  const loading = status === "loading" && !data;
  const refreshing = status === "loading" && !!data;

  useEffect(() => {
    if (status === "idle" && !data) {
      dispatch(fetchDashboard());
    }
  }, [data, dispatch, status]);

  const handleRefresh = useCallback(() => {
    dispatch(fetchDashboard());
  }, [dispatch]);

  const handleRetry = useCallback(() => {
    dispatch(fetchDashboard());
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
                onPress={() => router.push("/(dashboard)/nutrition")}
              >
                <ThemedText style={styles.detailLinkText}>
                  Open nutrition details
                </ThemedText>
              </TouchableOpacity>
            </>
          ) : null}

          {data && <RatioCard ratio={data.nutrition.ratio} />}

          {data && <LabsCard labs={data.labs} />}
        </>
      )}
    </ScrollView>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
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
