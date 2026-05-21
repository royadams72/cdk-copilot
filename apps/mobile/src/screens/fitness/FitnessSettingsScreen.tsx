import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { useStepCount } from "@/hooks/useStepCount";
import { getNativeHealthConnectBackgroundSyncStatus } from "@/lib/healthConnectNativeSync";

import { Card } from "../dashboard/components/Card";

function formatTimestamp(value: number | null | undefined) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export default function FitnessSettingsScreen() {
  const router = useRouter();
  const {
    backgroundReadGranted,
    missingHealthPermissions,
    status: stepStatus,
  } = useStepCount(10000);
  const [workerStatus, setWorkerStatus] = useState<
    Awaited<ReturnType<typeof getNativeHealthConnectBackgroundSyncStatus>> | null
  >(null);
  const [loadingWorkerStatus, setLoadingWorkerStatus] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const status = await getNativeHealthConnectBackgroundSyncStatus();
        if (!cancelled) {
          setWorkerStatus(status);
        }
      } finally {
        if (!cancelled) {
          setLoadingWorkerStatus(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const permissionSummary =
    stepStatus === "ready"
      ? missingHealthPermissions.length > 0
        ? `${missingHealthPermissions.length} Health Connect permissions still missing`
        : "Health Connect permissions look complete"
      : "Health Connect is not fully ready on this device";

  const backgroundSummary = backgroundReadGranted
    ? "Background Health Connect access is enabled"
    : "Background Health Connect access is not enabled";

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
          <MaterialIcons color="#0F172A" name="settings" size={24} />
        </View>

        <View style={{ gap: 4 }}>
          <ThemedText type="title">Fitness settings</ThemedText>
          <ThemedText style={{ opacity: 0.72 }}>
            Manage targets, Health Connect status, and historical repairs.
          </ThemedText>
        </View>

        <Card>
          <View style={{ gap: 12 }}>
            <View style={{ gap: 4 }}>
              <ThemedText type="defaultSemiBold">Health targets</ThemedText>
              <ThemedText style={{ opacity: 0.72 }}>
                Update steps, sleep, weight, and activity targets.
              </ThemedText>
            </View>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  params: {
                    domain: "lifestyle",
                    title: "Health targets",
                  },
                  pathname: "/targets",
                })
              }
            >
              <ThemedText style={{ fontWeight: "700" }}>Edit targets</ThemedText>
            </TouchableOpacity>
          </View>
        </Card>

        <Card>
          <View style={{ gap: 12 }}>
            <View style={{ gap: 4 }}>
              <ThemedText type="defaultSemiBold">Missing data</ThemedText>
              <ThemedText style={{ opacity: 0.72 }}>
                Repair historical gaps from Health Connect by category.
              </ThemedText>
            </View>
            <TouchableOpacity
              onPress={() => router.push("/(fitness)/missing-data")}
            >
              <ThemedText style={{ fontWeight: "700" }}>Open repair tools</ThemedText>
            </TouchableOpacity>
          </View>
        </Card>

        <Card>
          <View style={{ gap: 8 }}>
            <ThemedText type="defaultSemiBold">Health Connect status</ThemedText>
            <ThemedText style={{ opacity: 0.72 }}>{permissionSummary}</ThemedText>
            <ThemedText style={{ opacity: 0.72 }}>{backgroundSummary}</ThemedText>
            {loadingWorkerStatus ? (
              <View style={{ alignItems: "flex-start", paddingTop: 4 }}>
                <ActivityIndicator />
              </View>
            ) : (
              <View style={{ gap: 4 }}>
                <ThemedText style={{ opacity: 0.72 }}>
                  Native background worker:{" "}
                  {workerStatus?.nativeWorkerEnabled ? "scheduled" : "not scheduled"}
                </ThemedText>
                <ThemedText style={{ opacity: 0.72 }}>
                  Periodic work: {workerStatus?.periodicWorkState ?? "unknown"}
                </ThemedText>
                <ThemedText style={{ opacity: 0.72 }}>
                  Immediate work: {workerStatus?.immediateWorkState ?? "unknown"}
                </ThemedText>
                <ThemedText style={{ opacity: 0.72 }}>
                  Last task status: {workerStatus?.lastTaskStatus ?? "unknown"}
                </ThemedText>
                <ThemedText style={{ opacity: 0.72 }}>
                  Last scheduled: {formatTimestamp(workerStatus?.lastScheduledAt)}
                </ThemedText>
                <ThemedText style={{ opacity: 0.72 }}>
                  Last trigger: {formatTimestamp(workerStatus?.lastTriggeredAt)}
                </ThemedText>
                <ThemedText style={{ opacity: 0.72 }}>
                  Last worker start: {formatTimestamp(workerStatus?.lastWorkerStartedAt)}
                </ThemedText>
                <ThemedText style={{ opacity: 0.72 }}>
                  Last task start: {formatTimestamp(workerStatus?.lastTaskStartedAt)}
                </ThemedText>
                <ThemedText style={{ opacity: 0.72 }}>
                  Last task finish: {formatTimestamp(workerStatus?.lastTaskFinishedAt)}
                </ThemedText>
                {workerStatus?.lastFailureReason ? (
                  <ThemedText style={{ opacity: 0.72 }}>
                    Last failure: {workerStatus.lastFailureReason}
                  </ThemedText>
                ) : null}
              </View>
            )}
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}
