import { useCallback } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { formatMobileDate } from "@/lib/format/date";
import { toQueryErrorMessage } from "@/store/services/appApi";
import { useGetCarePlansQuery } from "@/store/services/carePlanApi";
import { AppScreen } from "@/components/app-screen";
import { AppButton } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { theme } from "@/constants/theme";
import { styles } from "@/screens/dashboard/styles";
import { NutritionStyles } from "@/screens/nutrition/styles";

function formatStatus(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function CarePlanList() {
  const router = useRouter();
  const { data, error, isFetching, isLoading, refetch } = useGetCarePlansQuery(
    undefined,
    {
      refetchOnMountOrArgChange: true,
    },
  );
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
    <AppScreen
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <AppButton label="Back" onPress={() => router.replace("/(dashboard)/dashboard")} variant="secondary" size="compact" />

      <View style={{ gap: theme.spacing.xs }}>
        <ThemedText type="title" style={NutritionStyles.screenTitle}>Care plans</ThemedText>
        <ThemedText style={{ color: theme.colors.copy }}>
          Active and completed care plans linked to your account.
        </ThemedText>
      </View>

      {error && !data ? (
        <Section title="Care plans unavailable">
          <ThemedText style={{ color: theme.colors.copy }}>{errorMessage}</ThemedText>
          <AppButton label="Retry" onPress={handleRefresh} variant="outline" size="compact" />
        </Section>
      ) : null}

      {data?.items?.length ? (
        data.items.map((plan) => (
          <Pressable
            key={plan.id}
            onPress={() =>
              router.push(
                (plan.reviewDue
                  ? `/(dashboard)/care-plan-review?id=${plan.id}`
                  : `/(dashboard)/care-plan?id=${plan.id}`) as never,
              )
            }
          >
            <Section style={plan.reviewDue ? styles.carePlanReviewCard : undefined}>
              <View style={styles.carePlanTaskHeader}>
                <ThemedText type="defaultSemiBold">{plan.title}</ThemedText>
                <ThemedText style={styles.carePlanTaskMeta}>
                  {plan.reviewDue ? "Review due" : formatStatus(plan.status)}
                </ThemedText>
              </View>
              <ThemedText style={styles.helperText}>
                {plan.taskCount} active task{plan.taskCount === 1 ? "" : "s"}
                {plan.reviewLabelDisplay ? ` · Review in ${plan.reviewLabelDisplay}` : ""}
              </ThemedText>
              {plan.reviewDue ? (
                <ThemedText style={styles.helperText}>
                  Open this plan to send your review back to the care team.
                </ThemedText>
              ) : null}
              <ThemedText style={styles.helperText}>
                Activated {formatMobileDate(plan.activatedAt)} · Updated{" "}
                {formatMobileDate(plan.updatedAt)}
              </ThemedText>
            </Section>
          </Pressable>
        ))
      ) : (
        <Section title="No care plans yet">
          <ThemedText style={{ color: theme.colors.copy }}>
            Your care team has not linked any care plans to your account yet.
          </ThemedText>
        </Section>
      )}
    </AppScreen>
  );
}
