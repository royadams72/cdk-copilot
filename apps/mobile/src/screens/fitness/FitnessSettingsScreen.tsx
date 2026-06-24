import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { useStepCount } from "@/hooks/useStepCount";
import { getCurrentHealthSyncProvider } from "@/lib/currentHealthSyncProvider";
import type { NativeHealthConnectBackgroundSyncStatus } from "@/lib/healthConnectNativeBridge";
import {
  getNativeHealthKitStatus,
  type NativeHealthKitStatus,
} from "@/lib/healthKitNativeBridge";

import { Card } from "../dashboard/components/Card";

function formatTimestamp(value: number | null | undefined) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function providerDisplayName() {
  return Platform.OS === "ios" ? "Apple Health" : "Health Connect";
}

export default function FitnessSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    backgroundReadGranted,
    missingHealthPermissions,
    status: stepStatus,
  } = useStepCount(10000);
  const [workerStatus, setWorkerStatus] = useState<
    NativeHealthConnectBackgroundSyncStatus | NativeHealthKitStatus | null
  >(null);
  const [loadingWorkerStatus, setLoadingWorkerStatus] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const status =
          Platform.OS === "ios"
            ? await getNativeHealthKitStatus()
            : await getCurrentHealthSyncProvider()?.getBackgroundSyncStatus();
        if (!cancelled) {
          setWorkerStatus(status ?? null);
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
        ? `${missingHealthPermissions.length} ${providerDisplayName()} permissions still missing`
        : `${providerDisplayName()} permissions look complete`
      : `${providerDisplayName()} is not fully ready on this device`;

  const backgroundSummary = backgroundReadGranted
    ? `Background ${providerDisplayName()} access is enabled`
    : `Background ${providerDisplayName()} access is not enabled`;

  const isAndroidWorkerStatus =
    workerStatus &&
    "nativeWorkerEnabled" in workerStatus &&
    workerStatus.platform === "android";
  const isIosHealthKitStatus =
    workerStatus &&
    "provider" in workerStatus &&
    workerStatus.provider === "healthkit";

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          gap: 12,
          padding: 16,
          paddingBottom: 32,
          paddingTop: Math.max(insets.top + 8, 20),
        }}
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
            Manage targets, health-provider status, and historical repairs.
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
                Repair historical gaps from your health provider by category.
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
            <ThemedText type="defaultSemiBold">{providerDisplayName()} status</ThemedText>
            <ThemedText style={{ opacity: 0.72 }}>{permissionSummary}</ThemedText>
            <ThemedText style={{ opacity: 0.72 }}>{backgroundSummary}</ThemedText>
            {loadingWorkerStatus ? (
              <View style={{ alignItems: "flex-start", paddingTop: 4 }}>
                <ActivityIndicator />
              </View>
            ) : (
              <View style={{ gap: 4 }}>
                {isAndroidWorkerStatus ? (
                  <>
                    <ThemedText style={{ opacity: 0.72 }}>
                      Native background worker:{" "}
                      {workerStatus.nativeWorkerEnabled ? "scheduled" : "not scheduled"}
                    </ThemedText>
                    <ThemedText style={{ opacity: 0.72 }}>
                      Periodic work: {workerStatus.periodicWorkState ?? "unknown"}
                    </ThemedText>
                    <ThemedText style={{ opacity: 0.72 }}>
                      Immediate work: {workerStatus.immediateWorkState ?? "unknown"}
                    </ThemedText>
                    <ThemedText style={{ opacity: 0.72 }}>
                      Last task status: {workerStatus.lastTaskStatus ?? "unknown"}
                    </ThemedText>
                    <ThemedText style={{ opacity: 0.72 }}>
                      Last scheduled: {formatTimestamp(workerStatus.lastScheduledAt)}
                    </ThemedText>
                    <ThemedText style={{ opacity: 0.72 }}>
                      Last trigger: {formatTimestamp(workerStatus.lastTriggeredAt)}
                    </ThemedText>
                    <ThemedText style={{ opacity: 0.72 }}>
                      Last worker start: {formatTimestamp(workerStatus.lastWorkerStartedAt)}
                    </ThemedText>
                    <ThemedText style={{ opacity: 0.72 }}>
                      Last task start: {formatTimestamp(workerStatus.lastTaskStartedAt)}
                    </ThemedText>
                    <ThemedText style={{ opacity: 0.72 }}>
                      Last task finish: {formatTimestamp(workerStatus.lastTaskFinishedAt)}
                    </ThemedText>
                    {workerStatus.lastFailureReason ? (
                      <ThemedText style={{ opacity: 0.72 }}>
                        Last failure: {workerStatus.lastFailureReason}
                      </ThemedText>
                    ) : null}
                  </>
                ) : isIosHealthKitStatus ? (
                  <>
                    <ThemedText style={{ opacity: 0.72 }}>
                      Strategy: native HealthKit observer delivery
                    </ThemedText>
                    <ThemedText style={{ opacity: 0.72 }}>
                      Background delivery:{" "}
                      {workerStatus.backgroundDeliveryEnabled ? "enabled" : "not enabled"}
                    </ThemedText>
                    <ThemedText style={{ opacity: 0.72 }}>
                      Pending observer types:{" "}
                      {workerStatus.pendingObserverTypes.length
                        ? workerStatus.pendingObserverTypes.join(", ")
                        : "none"}
                    </ThemedText>
                    <ThemedText style={{ opacity: 0.72 }}>
                      Last observer events:{" "}
                      {Object.keys(workerStatus.lastObserverEventAtByType).length
                        ? Object.entries(workerStatus.lastObserverEventAtByType)
                            .map(([key, value]) => `${key} (${new Date(value).toLocaleString()})`)
                            .join(", ")
                        : "none"}
                    </ThemedText>
                  </>
                ) : (
                  <ThemedText style={{ opacity: 0.72 }}>
                    Background status is unavailable on this build or device.
                  </ThemedText>
                )}
              </View>
            )}
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}
