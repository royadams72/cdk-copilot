import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { getCurrentHealthSyncProvider } from "@/lib/currentHealthSyncProvider";
import type { MeasurementKind } from "@/store/services/types";

import { Card } from "../dashboard/components/Card";

type RepairKind =
  | "steps"
  | "exercise"
  | "heart_rate"
  | "blood_pressure"
  | "sleep";

type RepairState = {
  error: string | null;
  running: boolean;
  summary: string | null;
};

const REPAIR_LABELS: Record<RepairKind, string> = {
  blood_pressure: "Blood pressure",
  exercise: "Exercise",
  heart_rate: "Heart rate",
  sleep: "Sleep",
  steps: "Steps",
};

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildHistoricalDateKeys(days: number) {
  const keys: string[] = [];
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  for (let offset = days; offset >= 1; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    keys.push(dateKey(date));
  }

  return keys;
}

export default function FitnessMissingDataScreen() {
  const router = useRouter();
  const [repairState, setRepairState] = useState<Record<RepairKind, RepairState>>({
    blood_pressure: { error: null, running: false, summary: null },
    exercise: { error: null, running: false, summary: null },
    heart_rate: { error: null, running: false, summary: null },
    sleep: { error: null, running: false, summary: null },
    steps: { error: null, running: false, summary: null },
  });

  const dateKeys = useMemo(() => buildHistoricalDateKeys(30), []);

  const runRepair = async (kind: RepairKind) => {
    const provider = getCurrentHealthSyncProvider();
    if (!provider) {
      Alert.alert("Repair unavailable", "Health sync is not available on this device.");
      return;
    }

    setRepairState((current) => ({
      ...current,
      [kind]: { error: null, running: true, summary: null },
    }));

    try {
      const result =
        kind === "steps"
          ? await provider.backfillStepDates(dateKeys, {
              reason: "steps-screen",
              windowKey: `manual-repair:${kind}:30d`,
            })
          : await provider.backfillMeasurementDates(
              kind as Exclude<MeasurementKind, "weight" | "steps">,
              dateKeys,
              {
                reason: "metric-screen",
                windowKey: `manual-repair:${kind}:30d`,
              },
            );

      const summary =
        kind === "steps"
          ? `${result.uploaded} day entries repaired`
          : `${result.uploaded} measurements repaired across ${result.resolvedDays} days`;

      setRepairState((current) => ({
        ...current,
        [kind]: { error: null, running: false, summary },
      }));

      Alert.alert(
        `${REPAIR_LABELS[kind]} repair finished`,
        summary,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRepairState((current) => ({
        ...current,
        [kind]: { error: message, running: false, summary: null },
      }));
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 32 }}
      >
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <TouchableOpacity onPress={() => router.back()}>
            <ThemedText style={{ fontWeight: "600" }}>‹ Back</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={{ gap: 4 }}>
          <ThemedText type="title">Missing data</ThemedText>
          <ThemedText style={{ opacity: 0.72 }}>
            {Platform.OS === "ios"
              ? "Repair historical Apple Health gaps for the last 30 completed days."
              : "Repair historical Health Connect gaps for the last 30 completed days."}
          </ThemedText>
        </View>

        {(Object.keys(REPAIR_LABELS) as RepairKind[]).map((kind) => {
          const state = repairState[kind];

          return (
            <Card key={kind}>
              <View style={{ gap: 12 }}>
                <View style={{ gap: 4 }}>
                  <ThemedText type="defaultSemiBold">{REPAIR_LABELS[kind]}</ThemedText>
                  <ThemedText style={{ opacity: 0.72 }}>
                    {Platform.OS === "ios"
                      ? `Check Apple Health for missing historical ${REPAIR_LABELS[
                          kind
                        ].toLowerCase()} data and import any gaps found.`
                      : `Check Health Connect for missing historical ${REPAIR_LABELS[
                          kind
                        ].toLowerCase()} data and import any gaps found.`}
                  </ThemedText>
                  {state.summary ? (
                    <ThemedText style={{ color: "#0F766E", opacity: 0.9 }}>
                      {state.summary}
                    </ThemedText>
                  ) : null}
                  {state.error ? (
                    <ThemedText style={{ color: "#B91C1C", opacity: 0.9 }}>
                      {state.error}
                    </ThemedText>
                  ) : null}
                </View>
                <TouchableOpacity
                  disabled={state.running}
                  onPress={() => {
                    void runRepair(kind);
                  }}
                >
                  {state.running ? (
                    <View style={{ alignItems: "flex-start", paddingTop: 2 }}>
                      <ActivityIndicator />
                    </View>
                  ) : (
                    <ThemedText style={{ fontWeight: "700" }}>
                      Repair last 30 days
                    </ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}
