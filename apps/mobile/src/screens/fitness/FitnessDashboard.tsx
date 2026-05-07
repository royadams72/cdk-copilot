import { useMemo } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { Card } from "../dashboard/components/Card";
import { styles } from "../dashboard/styles";
import { toQueryErrorMessage } from "@/store/services/dashboardApi";
import { useGetLatestMeasurementsQuery } from "@/store/services/measurementsApi";
import type { MeasurementLatest } from "@/store/services/types";

type FitnessCard = {
  kind: string;
  label: string;
  subtext: string;
  value: string;
};

function formatDateTime(value?: string) {
  if (!value) return "No reading yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No reading yet";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}

function toCard(doc?: MeasurementLatest): FitnessCard {
  if (!doc) {
    return {
      kind: "unknown",
      label: "No data",
      subtext: "No reading yet",
      value: "No data",
    };
  }

  if (doc.kind === "steps") {
    return {
      kind: doc.kind,
      label: "Steps",
      subtext: formatDateTime(doc.measuredAt),
      value:
        typeof doc.count === "number"
          ? `${Math.round(doc.count).toLocaleString()} steps`
          : "No data",
    };
  }

  if (doc.kind === "exercise") {
    return {
      kind: doc.kind,
      label: "Exercise",
      subtext: formatDateTime(doc.measuredAt),
      value:
        typeof doc.durationMin === "number"
          ? `${Math.round(doc.durationMin)} min`
          : "No data",
    };
  }

  if (doc.kind === "sleep") {
    return {
      kind: doc.kind,
      label: "Sleep",
      subtext: formatDateTime(doc.measuredAt),
      value:
        typeof doc.durationMin === "number"
          ? `${(doc.durationMin / 60).toFixed(1)} hrs`
          : "No data",
    };
  }

  if (doc.kind === "heart_rate") {
    return {
      kind: doc.kind,
      label: "Heart rate",
      subtext: formatDateTime(doc.measuredAt),
      value:
        typeof doc.bpm === "number" ? `${Math.round(doc.bpm)} bpm` : "No data",
    };
  }

  if (doc.kind === "blood_pressure") {
    return {
      kind: doc.kind,
      label: "Blood pressure",
      subtext: formatDateTime(doc.measuredAt),
      value:
        typeof doc.systolicMmHg === "number" &&
        typeof doc.diastolicMmHg === "number"
          ? `${Math.round(doc.systolicMmHg)}/${Math.round(doc.diastolicMmHg)} mmHg`
          : "No data",
    };
  }

  if (doc.kind === "weight") {
    return {
      kind: doc.kind,
      label: "Weight",
      subtext: formatDateTime(doc.measuredAt),
      value:
        typeof doc.valueKg === "number"
          ? `${doc.valueKg.toFixed(1)} kg`
          : "No data",
    };
  }

  return {
    kind: doc.kind,
    label: doc.kind,
    subtext: formatDateTime(doc.measuredAt),
    value: "No data",
  };
}

export default function FitnessDashboard() {
  const router = useRouter();
  const { data, error, isFetching, isLoading, refetch } =
    useGetLatestMeasurementsQuery(undefined);

  const items = data ?? [];
  const loading = isLoading && items.length === 0;
  const refreshing = isFetching && items.length > 0;
  const errorMessage = toQueryErrorMessage(
    error,
    "Failed to load fitness readings",
  );

  const cards = useMemo(() => items.map((item) => toCard(item)), [items]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <ThemedText style={styles.helperText}>
          Loading your fitness dashboard...
        </ThemedText>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refetch} />
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <ThemedText type="title">Health</ThemedText>
      </View>

      <Card>
        <ThemedText type="defaultSemiBold">Health sync</ThemedText>
        <ThemedText style={styles.helperText}>
          Health Connect features are temporarily disabled while the crash path
          is being isolated.
        </ThemedText>
      </Card>

      {error ? (
        <Card>
          <ThemedText type="defaultSemiBold">Couldn&apos;t refresh</ThemedText>
          <ThemedText style={styles.helperText}>{errorMessage}</ThemedText>
        </Card>
      ) : null}

      {cards.length ? (
        cards.map((card, index) => (
          <Card key={`${card.kind}-${index}`}>
            <ThemedText type="defaultSemiBold">{card.label}</ThemedText>
            <ThemedText>{card.value}</ThemedText>
            <ThemedText style={styles.helperText}>{card.subtext}</ThemedText>
          </Card>
        ))
      ) : (
        <Card>
          <ThemedText type="defaultSemiBold">No health readings yet</ThemedText>
          <ThemedText style={styles.helperText}>
            Measurements will appear here once data is available.
          </ThemedText>
        </Card>
      )}
    </ScrollView>
  );
}
