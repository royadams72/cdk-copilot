import type { HealthSyncProvider } from "@/lib/healthSyncProvider";
import {
  getNativeHealthConnectBackgroundSyncStatus,
  triggerNativeHealthConnectBackgroundSyncNow,
} from "@/lib/healthConnectNativeBridge";
import {
  backfillHealthConnectMeasurementDates,
  readHealthConnectHeartRateEntriesForDate,
  syncRecentHealthConnectMeasurements,
} from "@/lib/healthConnectMeasurementSync";
import {
  readHealthConnectHourlyStepsForDate,
  readHealthConnectStepSummaryForDate,
} from "@/lib/healthConnectStepSummary";
import {
  backfillHealthConnectStepDates,
  hasHealthConnectBackgroundReadPermission,
  syncTodayStepMeasurement,
} from "@/lib/healthConnectStepSync";

export const androidHealthConnectProvider: HealthSyncProvider = {
  providerName: "health_connect",
  backfillMeasurementDates: backfillHealthConnectMeasurementDates,
  backfillStepDates: backfillHealthConnectStepDates,
  getBackgroundSyncStatus: getNativeHealthConnectBackgroundSyncStatus,
  hasBackgroundReadPermission: hasHealthConnectBackgroundReadPermission,
  readHourlyStepsForDate: async (date) =>
    (await readHealthConnectHourlyStepsForDate(date)) ?? [],
  readHeartRateEntriesForDate: readHealthConnectHeartRateEntriesForDate,
  readStepSummaryForDate: readHealthConnectStepSummaryForDate,
  syncRecentMeasurements: async (reason, options) => {
    await syncRecentHealthConnectMeasurements(reason, options);
  },
  syncTodaySteps: async (reason, options) => {
    await syncTodayStepMeasurement(reason, options);
  },
  triggerBackgroundSyncNow: triggerNativeHealthConnectBackgroundSyncNow,
};
