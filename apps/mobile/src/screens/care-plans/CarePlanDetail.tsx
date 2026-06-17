import { useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { setLastViewedCarePlanAt } from "@/lib/carePlans";
import { toQueryErrorMessage } from "@/store/services/appApi";
import { useGetCarePlanByIdQuery } from "@/store/services/carePlanApi";
import { Card } from "@/screens/dashboard/components/Card";
import { styles } from "@/screens/dashboard/styles";

function formatDate(value: string | null) {
  if (!value) return "Not set";
  const next = new Date(value);
  if (Number.isNaN(next.getTime())) return "Not set";
  return next.toLocaleDateString("en-GB");
}

function formatStatus(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function CarePlanDetail() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const carePlanId = typeof params.id === "string" ? params.id : "";
  const { data, error, isFetching, isLoading, refetch } =
    useGetCarePlanByIdQuery(carePlanId, { skip: !carePlanId });
  const refreshing = isFetching && !!data;
  const loading = isLoading && !data;
  const errorMessage = toQueryErrorMessage(error, "We couldn't load your care plan.");

  useEffect(() => {
    if (!data?.updatedAt) return;
    void setLastViewedCarePlanAt(data.updatedAt);
  }, [data?.updatedAt]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <ThemedText style={styles.helperText}>Loading your care plan...</ThemedText>
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

      {!carePlanId || !data ? (
        <Card>
          <ThemedText type="defaultSemiBold">Care plan unavailable</ThemedText>
          <ThemedText style={styles.helperText}>
            {carePlanId ? errorMessage : "No care plan was selected."}
          </ThemedText>
        </Card>
      ) : (
        <>
          <View style={styles.header}>
            <ThemedText type="title">{data.title}</ThemedText>
            <ThemedText style={styles.carePlanStatusText}>
              {formatStatus(data.status)}
            </ThemedText>
          </View>

          <Card>
            <ThemedText type="defaultSemiBold">Plan summary</ThemedText>
            <View style={styles.carePlanSummaryGrid}>
              <View style={styles.carePlanSummaryCell}>
                <ThemedText style={styles.carePlanMetaLabel}>Associated diagnoses</ThemedText>
                {data.diagnoses.length ? (
                  data.diagnoses.map((diagnosis) => (
                    <ThemedText key={diagnosis.id} style={styles.carePlanMetaValue}>
                      {diagnosis.label}
                    </ThemedText>
                  ))
                ) : (
                  <ThemedText style={styles.helperText}>No diagnoses linked</ThemedText>
                )}
              </View>
              <View style={styles.carePlanSummaryCell}>
                <ThemedText style={styles.carePlanMetaLabel}>Completed</ThemedText>
                <ThemedText style={styles.carePlanMetaValue}>
                  {formatDate(data.completedAt)}
                </ThemedText>
              </View>
              <View style={styles.carePlanSummaryCell}>
                <ThemedText style={styles.carePlanMetaLabel}>Review in</ThemedText>
                <ThemedText style={styles.carePlanMetaValue}>
                  {data.reviewLabel ?? "Not set"}
                </ThemedText>
              </View>
              <View style={styles.carePlanSummaryCell}>
                <ThemedText style={styles.carePlanMetaLabel}>Activated</ThemedText>
                <ThemedText style={styles.carePlanMetaValue}>
                  {formatDate(data.activatedAt)}
                </ThemedText>
              </View>
            </View>
            {data.notes ? (
              <View style={styles.carePlanSection}>
                <ThemedText style={styles.carePlanMetaLabel}>Notes</ThemedText>
                <ThemedText style={styles.carePlanBodyText}>{data.notes}</ThemedText>
              </View>
            ) : null}
          </Card>

          <Card>
            <ThemedText type="defaultSemiBold">People involved in this plan</ThemedText>
            <View style={styles.carePlanSummaryGrid}>
              <View style={styles.carePlanSummaryCell}>
                <ThemedText style={styles.carePlanMetaLabel}>Created by</ThemedText>
                <ThemedText style={styles.carePlanMetaValue}>{data.createdBy}</ThemedText>
              </View>
              <View style={styles.carePlanSummaryCell}>
                <ThemedText style={styles.carePlanMetaLabel}>Updated by</ThemedText>
                <ThemedText style={styles.carePlanMetaValue}>{data.updatedBy}</ThemedText>
              </View>
              <View style={styles.carePlanSummaryCellWide}>
                <ThemedText style={styles.carePlanMetaLabel}>Owners</ThemedText>
                {data.ownerLabels.length ? (
                  data.ownerLabels.map((owner) => (
                    <ThemedText key={owner} style={styles.carePlanMetaValue}>
                      {owner}
                    </ThemedText>
                  ))
                ) : (
                  <ThemedText style={styles.helperText}>No owners linked</ThemedText>
                )}
              </View>
            </View>
          </Card>

          <Card>
            <ThemedText type="defaultSemiBold">Goals</ThemedText>
            <ThemedText style={styles.helperText}>Goals linked to this care plan.</ThemedText>
            {data.goals.length ? (
              data.goals.map((goal) => (
                <View key={goal.id} style={styles.carePlanListRow}>
                  <ThemedText style={styles.carePlanListTitle}>{goal.label}</ThemedText>
                  <ThemedText style={styles.carePlanBodyText}>
                    {goal.targetSummary ?? "No target summary"}
                  </ThemedText>
                </View>
              ))
            ) : (
              <ThemedText style={styles.helperText}>No goals recorded.</ThemedText>
            )}
          </Card>

          <Card>
            <ThemedText type="defaultSemiBold">Tasks</ThemedText>
            <ThemedText style={styles.helperText}>
              Daily, weekly, or once-off actions to support your plan.
            </ThemedText>
            {data.tasks.length ? (
              data.tasks.map((task) => (
                <View key={task.id} style={styles.carePlanListRow}>
                  <View style={styles.carePlanTaskHeader}>
                    <ThemedText style={styles.carePlanListTitle}>{task.label}</ThemedText>
                    <ThemedText style={styles.carePlanTaskMeta}>
                      {formatStatus(task.status)} · {task.freq}
                    </ThemedText>
                  </View>
                  {task.instructions ? (
                    <ThemedText style={styles.carePlanBodyText}>
                      {task.instructions}
                    </ThemedText>
                  ) : null}
                </View>
              ))
            ) : (
              <ThemedText style={styles.helperText}>No tasks recorded.</ThemedText>
            )}
          </Card>
        </>
      )}
    </ScrollView>
  );
}
