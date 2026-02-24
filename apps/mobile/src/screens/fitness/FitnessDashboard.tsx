import { useMemo } from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { StackedRadialsCard } from "../dashboard/components/StackedRadials";
import { DashboardRadial } from "../dashboard/types";

export default function FitnessDashboard() {
  const router = useRouter();
  const healthRadials = useMemo<DashboardRadial[]>(
    () => [
      {
        id: "steps",
        label: "Steps",
        unit: "steps",
        actual: null,
        target: 10000,
        percent: null,
      },
      {
        id: "minutes-exercise",
        label: "Minutes exercise",
        unit: "min",
        actual: null,
        target: 30,
        percent: null,
      },
      {
        id: "calories-burned",
        label: "Calories burned",
        unit: "kcal",
        actual: null,
        target: 500,
        percent: null,
      },
    ],
    [],
  );

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
    >
      <TouchableOpacity onPress={() => router.back()}>
        <ThemedText style={{ fontWeight: "600" }}>‹ Back</ThemedText>
      </TouchableOpacity>

      <View style={{ gap: 4 }}>
        <ThemedText type="title">Fitness dashboard</ThemedText>
        <ThemedText style={{ opacity: 0.72 }}>
          Activity progress and movement goals.
        </ThemedText>
      </View>

      <StackedRadialsCard
        centerLabel="Health"
        radials={healthRadials}
        subtitle="Daily activity"
        title="Health"
      />
    </ScrollView>
  );
}
