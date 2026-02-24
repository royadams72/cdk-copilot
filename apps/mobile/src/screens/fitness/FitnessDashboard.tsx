import { useMemo } from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { StackedRadialsCard } from "../dashboard/components/StackedRadials";
import { DashboardRadial } from "../dashboard/types";
import { useStepCount } from "@/hooks/useStepCount";

export default function FitnessDashboard() {
  const router = useRouter();
  const { percentOfGoal, status, stepsToday } = useStepCount(10000);
  const healthRadials = useMemo<DashboardRadial[]>(
    () => [
      {
        id: "steps",
        label: "Steps",
        unit: "steps",
        actual: stepsToday,
        target: 10000,
        percent: percentOfGoal,
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
    [percentOfGoal, stepsToday],
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
        {status === "permission-denied" ? (
          <ThemedText style={{ opacity: 0.72 }}>
            Enable motion permissions to count steps.
          </ThemedText>
        ) : null}
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
