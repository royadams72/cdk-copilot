import { useEffect } from "react";
import {
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchDashboard,
  selectDashboardData,
  selectDashboardScope,
  selectDashboardStatus,
} from "@/store/slices/dashboardSlice";

import { Card } from "./components/Card";
import { formatDateShort } from "./utils";
import { styles } from "./styles";
import { LabsCard } from "../labs/components/LabsCard";
import { MedicationCard } from "./components/MedicationCard";

export default function MedsLabsDashboard() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectDashboardData);
  const status = useAppSelector(selectDashboardStatus);
  const scope = useAppSelector(selectDashboardScope);

  useEffect(() => {
    if ((status === "idle" && !data) || scope !== "today") {
      dispatch(fetchDashboard({ scope: "today" }));
    }
  }, [data, dispatch, scope, status]);

  if (status === "loading" && !data) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <ThemedText style={styles.helperText}>
          Loading meds/labs dashboard...
        </ThemedText>
      </View>
    );
  }

  const latestMedication = data?.medications.recent[0] ?? null;
  const latestLab = data?.labs.recent[0] ?? null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
    </ScrollView>
  );
}
