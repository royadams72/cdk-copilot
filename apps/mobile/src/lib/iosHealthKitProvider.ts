import type { HealthSyncProvider } from "@/lib/healthSyncProvider";
import {
  enableNativeHealthKitBackgroundDelivery,
  getNativeHealthKitStatus,
  readNativeHealthKitHourlyStepCountsForDate,
  readNativeHealthKitHeartRateEntriesForDate,
  readNativeHealthKitStepSummaryForDate,
  requestNativeHealthKitAuthorization,
  triggerNativeHealthKitSyncNow,
} from "@/lib/healthKitNativeBridge";
import {
  backfillHealthKitMeasurementDates,
  backfillHealthKitStepDates,
  syncRecentHealthKitMeasurements,
  syncTodayHealthKitSteps,
} from "@/lib/healthKitMeasurementSync";

export const iosHealthKitProvider: HealthSyncProvider = {
  providerName: "healthkit",
  backfillMeasurementDates: backfillHealthKitMeasurementDates,
  backfillStepDates: backfillHealthKitStepDates,
  getBackgroundSyncStatus: async () => null,
  hasBackgroundReadPermission: async () =>
    (await getNativeHealthKitStatus())?.backgroundDeliveryEnabled ?? false,
  readHourlyStepsForDate: readNativeHealthKitHourlyStepCountsForDate,
  readHeartRateEntriesForDate: readNativeHealthKitHeartRateEntriesForDate,
  readStepSummaryForDate: readNativeHealthKitStepSummaryForDate,
  syncRecentMeasurements: async (reason, options) => {
    await syncRecentHealthKitMeasurements(reason, options);
  },
  syncTodaySteps: async (reason, options) => {
    await syncTodayHealthKitSteps(reason, options);
  },
  triggerBackgroundSyncNow: async () => {
    await triggerNativeHealthKitSyncNow();
    return null;
  },
};

export async function requestIosHealthKitAccess() {
  return requestNativeHealthKitAuthorization();
}

export async function enableIosHealthKitBackgroundDelivery() {
  return enableNativeHealthKitBackgroundDelivery();
}
