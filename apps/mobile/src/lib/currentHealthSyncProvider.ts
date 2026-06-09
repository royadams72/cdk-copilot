import { Platform } from "react-native";

import { androidHealthConnectProvider } from "@/lib/androidHealthConnectProvider";
import type { HealthSyncProvider, HealthSyncProviderName } from "@/lib/healthSyncProvider";
import { iosHealthKitProvider } from "@/lib/iosHealthKitProvider";

export function getCurrentHealthSyncProvider(): HealthSyncProvider | null {
  if (Platform.OS === "android") {
    return androidHealthConnectProvider;
  }

  if (Platform.OS === "ios") {
    return iosHealthKitProvider;
  }

  return null;
}

export function getCurrentHealthSyncProviderName(): HealthSyncProviderName {
  return getCurrentHealthSyncProvider()?.providerName ?? "health_connect";
}
