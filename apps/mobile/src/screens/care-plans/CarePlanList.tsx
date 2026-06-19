import { useCallback } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { formatMobileDate } from "@/lib/format/date";
import { toQueryErrorMessage } from "@/store/services/appApi";
import { useGetCarePlansQuery } from "@/store/services/carePlanApi";
import { Card } from "@/screens/dashboard/components/Card";
import { styles } from "@/screens/dashboard/styles";

function formatStatus(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function CarePlanList() {
  const router = useRouter();
  const { data, error, isFetching, isLoading, refetch } = useGetCarePlansQuery();
  const loading = isLoading && !data;
  const refreshing = isFetching && !!data;
  const errorMessage = toQueryErrorMessage(error, "We couldn't load your care plans.");

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <ThemedText style={styles.helperText}>Loading your care plans...</ThemedText>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <TouchableOpacity onPress={() => router.back()}>
        <ThemedText style={{ fontWeight: "600" }}>‹ Back</ThemedText>
      </TouchableOpacity>

      <View style={styles.header}>
        <ThemedText type="title">Care plans</ThemedText>
        <ThemedText style={styles.subtleText}>
          Active and completed care plans linked to your account.
        </ThemedText>
      </View>

      {error && !data ? (
        <Card>
          <ThemedText type="defaultSemiBold">Care plans unavailable</ThemedText>
          <ThemedText style={styles.helperText}>{errorMessage}</ThemedText>
        </Card>
      ) : null}

      {data?.items?.length ? (
        data.items.map((plan) => (
          <TouchableOpacity
            key={plan.id}
            onPress={() => router.push(`/(dashboard)/care-plan?id=${plan.id}` as never)}
          >
            <Card>
              <View style={styles.carePlanTaskHeader}>
                <ThemedText type="defaultSemiBold">{plan.title}</ThemedText>
                <ThemedText style={styles.carePlanTaskMeta}>
                  {formatStatus(plan.status)}
                </ThemedText>
              </View>
              <ThemedText style={styles.helperText}>
                {plan.taskCount} active task{plan.taskCount === 1 ? "" : "s"}
                {plan.reviewLabel ? ` · Review in ${plan.reviewLabel}` : ""}
              </ThemedText>
              <ThemedText style={styles.helperText}>
                Activated {formatMobileDate(plan.activatedAt)} · Updated{" "}
                {formatMobileDate(plan.updatedAt)}
              </ThemedText>
            </Card>
          </TouchableOpacity>
        ))
      ) : (
        <Card>
          <ThemedText type="defaultSemiBold">No care plans yet</ThemedText>
          <ThemedText style={styles.helperText}>
            Your care team has not linked any care plans to your account yet.
          </ThemedText>
        </Card>
      )}
    </ScrollView>
  );
}
