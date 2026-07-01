import { useCallback } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import { ThemedText } from "@/components/themed-text";

import { styles } from "./styles";
import { LabsCard } from "../labs/components/LabsCard";
import { MedicationCard } from "./components/MedicationCard";
import {
  toQueryErrorMessage,
  useGetDashboardQuery,
} from "@/store/services/dashboardApi";
import { useGetSymptomsQuery } from "@/store/services/symptomsApi";
import { Card } from "./components/Card";
import { NutritionStyles } from "../nutrition/styles";

export default function MedsLabsDashboard() {
  const router = useRouter();

  const { data, error, isFetching, isLoading, refetch } =
    useGetDashboardQuery("all");
  const { data: symptomData } = useGetSymptomsQuery();
  const errorMessage = toQueryErrorMessage(
    error,
    "We couldn't refresh your nutrition data",
  );

  const refreshing = isFetching && !!data;
  const loading = isLoading && !data;

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <ThemedText style={styles.helperText}>
          Loading meds/labs dashboard...
        </ThemedText>
      </View>
    );
  }
  {
    if (error)
      return (
        <Card>
          <ThemedText type="defaultSemiBold">
            We couldn't refresh your nutrition data
          </ThemedText>
          <ThemedText style={styles.helperText}>{errorMessage}</ThemedText>
          <TouchableOpacity
            style={NutritionStyles.retryButton}
            onPress={handleRefresh}
          >
            <ThemedText style={NutritionStyles.retryText}>Retry</ThemedText>
          </TouchableOpacity>
        </Card>
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
        <ThemedText type="title">Meds/Labs dashboard</ThemedText>
        <ThemedText style={styles.subtleText}>
          Summary of your medication and lab status.
        </ThemedText>
      </View>
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

      <Card>
        <ThemedText type="defaultSemiBold">Symptoms</ThemedText>
        <ThemedText style={styles.helperText}>
          {symptomData?.activeSymptoms.length
            ? `${symptomData.activeSymptoms.length} active symptom${symptomData.activeSymptoms.length === 1 ? "" : "s"} logged`
            : "No active symptoms logged yet."}
        </ThemedText>
        {symptomData?.history?.[0]?.after ? (
          <ThemedText style={styles.helperText}>
            Latest: {symptomData.history[0].after.name} on{" "}
            {new Date(
              symptomData.history[0].after.recordedAt,
            ).toLocaleDateString("en-GB")}
          </ThemedText>
        ) : null}
        <TouchableOpacity
          style={styles.primaryActionButton}
          onPress={() => router.push("/(symptoms)/symptoms" as never)}
        >
          <ThemedText style={styles.primaryActionText}>Track symptoms</ThemedText>
        </TouchableOpacity>
      </Card>
    </ScrollView>
  );
}
