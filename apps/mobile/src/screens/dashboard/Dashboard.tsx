import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { formatApiError } from "@/lib/formatApiError";
import { DashboardData, ApiResponse } from "./types";
import { styles } from "./styles";
import { Card } from "./copmonents/Card";
import { LabsCard } from "./copmonents/LabsCard";
import { StackedRadialsCard } from "./copmonents/SatckedRadials";
import { describeRange } from "./utils";
import { RatioCard } from "./copmonents/RadioCard";

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setError(null);
      const res = await authFetch(`${API}/api/dashboard`, {
        method: "GET",
      });
      // parse as unknown because the response could be a success shape (ApiResponse) or an error shape
      const body: unknown = await res.json().catch(() => null);
      // check for success shape before using it as ApiResponse
      if (!res.ok || !(body as ApiResponse)?.ok) {
        // formatApiError expects an ApiErrorBody; assert to any here so TypeScript accepts the possible error shape
        throw new Error(formatApiError(res.status, (body as any) ?? null));
      }
      setData((body as ApiResponse).data);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load your dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDashboard();
  }, [fetchDashboard]);

  const handleRetry = useCallback(() => {
    if (!data) {
      setLoading(true);
    }
    fetchDashboard();
  }, [data, fetchDashboard]);

  const rangeSummary = useMemo(() => {
    if (!data) return "";
    return describeRange(data.nutrition.range);
  }, [data]);

  if (loading && !data) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <ThemedText style={styles.helperText}>
          Loading your dashboard...
        </ThemedText>
      </View>
    );
  }

  const showBlockingError = !loading && !data && !!error;

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

          {error && data && (
            <InlineError message={error} onRetry={handleRetry} />
          )}

          {data?.nutrition.radials?.length ? (
            <StackedRadialsCard radials={data.nutrition.radials} />
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
