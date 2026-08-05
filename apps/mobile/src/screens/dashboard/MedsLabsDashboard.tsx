import { useCallback } from "react";
import {
  ActivityIndicator,
  RefreshControl,
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
import { AppScreen } from "@/components/app-screen";
import { AppButton } from "@/components/ui/button";

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
            We couldn&apos;t refresh your medication and lab data
          </ThemedText>
          <ThemedText style={styles.helperText}>{errorMessage}</ThemedText>
          <AppButton label="Retry" onPress={handleRefresh} variant="outline" size="compact" />
        </Card>
      );
  }

  return (
    <AppScreen
      padded={false}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <AppButton label="Back" onPress={() => router.back()} variant="secondary" size="compact" />

      <View style={styles.header}>
        <ThemedText type="title" style={NutritionStyles.screenTitle}>Meds/Labs dashboard</ThemedText>
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
        <ThemedText type="defaultSemiBold" style={styles.panelTitle}>Symptoms</ThemedText>
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
        <AppButton
          label="Track symptoms"
          onPress={() => router.push("/(symptoms)/symptoms" as never)}
          size="compact"
        />
      </Card>
    </AppScreen>
  );
}
