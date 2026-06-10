import type { MeasurementDayEntry } from "@/store/services/types";
import type { NativeHealthConnectBackgroundSyncStatus } from "@/lib/healthConnectNativeBridge";
import type { StepActivitySummary } from "@/lib/healthConnectStepSummary";

export type HealthSyncProviderName = "health_connect" | "healthkit";

export type HealthSyncTrigger =
  | "active"
  | "background"
  | "background-task"
  | "interval"
  | "mount";

export type StepBackfillResult = {
  attempted: number;
  resolvedDateKeys: string[];
  resolvedDays: number;
  uploaded: number;
};

export type MeasurementBackfillResult = {
  attempted: number;
  resolvedDays: number;
  uploaded: number;
};

export interface HealthSyncProvider {
  providerName: HealthSyncProviderName;
  backfillMeasurementDates(
    kind: "blood_pressure" | "exercise" | "heart_rate" | "sleep",
    missingDateKeys: string[],
    options: { reason?: "metric-screen"; windowKey: string },
  ): Promise<MeasurementBackfillResult>;
  backfillStepDates(
    missingDateKeys: string[],
    options: { reason?: "steps-screen"; windowKey: string },
  ): Promise<StepBackfillResult>;
  getBackgroundSyncStatus(): Promise<NativeHealthConnectBackgroundSyncStatus | null>;
  hasBackgroundReadPermission(): Promise<boolean>;
  readHourlyStepsForDate(date: Date): Promise<number[]>;
  readHeartRateEntriesForDate(date: Date): Promise<MeasurementDayEntry[]>;
  readStepSummaryForDate(date: Date): Promise<StepActivitySummary | null>;
  syncRecentMeasurements(
    reason: Extract<HealthSyncTrigger, "active" | "background-task" | "interval" | "mount">,
    options?: { force?: boolean },
  ): Promise<void>;
  syncTodaySteps(
    reason: HealthSyncTrigger,
    options?: { force?: boolean },
  ): Promise<void>;
  triggerBackgroundSyncNow(): Promise<NativeHealthConnectBackgroundSyncStatus | null>;
}
