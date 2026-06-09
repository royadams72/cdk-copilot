import { NativeModules, Platform } from "react-native";
import type { MeasurementDayEntry } from "@/store/services/types";
import type { StepActivitySummary } from "@/lib/healthConnectStepSummary";

export type NativeHealthKitStatus = {
  available: boolean;
  backgroundDeliveryEnabled: boolean;
  lastObserverEventAtByType: Partial<Record<NativeHealthKitObservedType, string>>;
  pendingObserverTypes: NativeHealthKitObservedType[];
  provider: "healthkit";
  readAuthorization: Record<string, string>;
  strategy: "healthkit-observer-query-native";
};

export type NativeHealthKitObservedType =
  | "blood_pressure"
  | "exercise"
  | "heart_rate"
  | "sleep"
  | "steps";

type NativeHealthKitStepSummary = StepActivitySummary & {
  selectedDataOrigin: string | null;
};

type NativeHealthKitHeartRateEntry = {
  measuredAt: string;
  value: number | null;
  value2: number | null;
};

type NativeHealthKitAnchoredHeartRateEntry = NativeHealthKitHeartRateEntry & {
  externalRecordId: string | null;
};

type NativeHealthKitAnchoredBloodPressureEntry = {
  diastolicMmHg: number | null;
  externalRecordId: string | null;
  measuredAt: string;
  systolicMmHg: number | null;
};

type NativeHealthKitAnchoredSleepEntry = {
  durationMin: number | null;
  externalRecordId: string | null;
  measuredAt: string;
  sleepFromAt: string;
  sleepToAt: string;
};

type NativeHealthKitAnchoredExerciseEntry = {
  caloriesKcal: number | null;
  durationMin: number | null;
  exerciseId: string;
  exerciseTitle: string;
  externalRecordId: string | null;
  measuredAt: string;
};

type HealthKitSyncModuleShape = {
  consumePendingObserverTypes?: () => Promise<NativeHealthKitObservedType[]>;
  enableBackgroundDelivery?: () => Promise<NativeHealthKitStatus>;
  getStatus?: () => Promise<NativeHealthKitStatus>;
  isAvailable?: () => Promise<boolean>;
  readBloodPressureEntriesForDate?: (
    isoDate: string,
  ) => Promise<NativeHealthKitAnchoredBloodPressureEntry[]>;
  readExerciseEntriesForDate?: (
    isoDate: string,
  ) => Promise<NativeHealthKitAnchoredExerciseEntry[]>;
  readSleepEntriesForDate?: (
    isoDate: string,
  ) => Promise<NativeHealthKitAnchoredSleepEntry[]>;
  readAnchoredBloodPressureChanges?: (
    startIsoDate?: string | null,
  ) => Promise<NativeHealthKitAnchoredBloodPressureEntry[]>;
  readAnchoredExerciseChanges?: (
    startIsoDate?: string | null,
  ) => Promise<NativeHealthKitAnchoredExerciseEntry[]>;
  readAnchoredHeartRateChanges?: (
    startIsoDate?: string | null,
  ) => Promise<NativeHealthKitAnchoredHeartRateEntry[]>;
  readAnchoredSleepChanges?: (
    startIsoDate?: string | null,
  ) => Promise<NativeHealthKitAnchoredSleepEntry[]>;
  readHourlyStepCountsForDate?: (isoDate: string) => Promise<number[]>;
  readHeartRateEntriesForDate?: (
    isoDate: string,
  ) => Promise<NativeHealthKitHeartRateEntry[]>;
  readStepSummaryForDate?: (
    isoDate: string,
  ) => Promise<NativeHealthKitStepSummary | null>;
  requestAuthorization?: () => Promise<NativeHealthKitStatus>;
  triggerSyncNow?: () => Promise<NativeHealthKitStatus>;
};

const nativeModule = NativeModules.HealthKitSyncModule as
  | HealthKitSyncModuleShape
  | undefined;

export async function isNativeHealthKitAvailable() {
  if (Platform.OS !== "ios" || !nativeModule?.isAvailable) {
    return false;
  }

  return nativeModule.isAvailable();
}

export async function getNativeHealthKitStatus() {
  if (Platform.OS !== "ios" || !nativeModule?.getStatus) {
    return null;
  }

  return nativeModule.getStatus();
}

export async function requestNativeHealthKitAuthorization() {
  if (Platform.OS !== "ios" || !nativeModule?.requestAuthorization) {
    return null;
  }

  return nativeModule.requestAuthorization();
}

export async function enableNativeHealthKitBackgroundDelivery() {
  if (Platform.OS !== "ios" || !nativeModule?.enableBackgroundDelivery) {
    return null;
  }

  return nativeModule.enableBackgroundDelivery();
}

export async function triggerNativeHealthKitSyncNow() {
  if (Platform.OS !== "ios" || !nativeModule?.triggerSyncNow) {
    return null;
  }

  return nativeModule.triggerSyncNow();
}

export async function consumeNativeHealthKitPendingObserverTypes() {
  if (Platform.OS !== "ios" || !nativeModule?.consumePendingObserverTypes) {
    return [] as NativeHealthKitObservedType[];
  }

  return (await nativeModule.consumePendingObserverTypes()) ?? [];
}

export async function readNativeHealthKitStepSummaryForDate(date: Date) {
  if (Platform.OS !== "ios" || !nativeModule?.readStepSummaryForDate) {
    return null;
  }

  return nativeModule.readStepSummaryForDate(date.toISOString());
}

export async function readNativeHealthKitHeartRateEntriesForDate(
  date: Date,
): Promise<MeasurementDayEntry[]> {
  if (Platform.OS !== "ios" || !nativeModule?.readHeartRateEntriesForDate) {
    return [];
  }

  const entries = await nativeModule.readHeartRateEntriesForDate(
    date.toISOString(),
  );

  return (entries ?? []).map((entry) => ({
    measuredAt: entry.measuredAt,
    value: entry.value,
    value2: entry.value2,
  }));
}

export async function readNativeHealthKitHourlyStepCountsForDate(date: Date) {
  if (Platform.OS !== "ios" || !nativeModule?.readHourlyStepCountsForDate) {
    return [] as number[];
  }

  return (await nativeModule.readHourlyStepCountsForDate(date.toISOString())) ?? [];
}

export async function readNativeHealthKitAnchoredHeartRateChanges(
  startDate?: Date | null,
) {
  if (Platform.OS !== "ios" || !nativeModule?.readAnchoredHeartRateChanges) {
    return [] as NativeHealthKitAnchoredHeartRateEntry[];
  }

  return (
    (await nativeModule.readAnchoredHeartRateChanges(
      startDate ? startDate.toISOString() : null,
    )) ?? []
  );
}

export async function readNativeHealthKitAnchoredBloodPressureChanges(
  startDate?: Date | null,
) {
  if (Platform.OS !== "ios" || !nativeModule?.readAnchoredBloodPressureChanges) {
    return [] as NativeHealthKitAnchoredBloodPressureEntry[];
  }

  return (
    (await nativeModule.readAnchoredBloodPressureChanges(
      startDate ? startDate.toISOString() : null,
    )) ?? []
  );
}

export async function readNativeHealthKitAnchoredSleepChanges(
  startDate?: Date | null,
) {
  if (Platform.OS !== "ios" || !nativeModule?.readAnchoredSleepChanges) {
    return [] as NativeHealthKitAnchoredSleepEntry[];
  }

  return (
    (await nativeModule.readAnchoredSleepChanges(
      startDate ? startDate.toISOString() : null,
    )) ?? []
  );
}

export async function readNativeHealthKitAnchoredExerciseChanges(
  startDate?: Date | null,
) {
  if (Platform.OS !== "ios" || !nativeModule?.readAnchoredExerciseChanges) {
    return [] as NativeHealthKitAnchoredExerciseEntry[];
  }

  return (
    (await nativeModule.readAnchoredExerciseChanges(
      startDate ? startDate.toISOString() : null,
    )) ?? []
  );
}

export async function readNativeHealthKitBloodPressureEntriesForDate(date: Date) {
  if (Platform.OS !== "ios" || !nativeModule?.readBloodPressureEntriesForDate) {
    return [] as NativeHealthKitAnchoredBloodPressureEntry[];
  }

  return (await nativeModule.readBloodPressureEntriesForDate(date.toISOString())) ?? [];
}

export async function readNativeHealthKitSleepEntriesForDate(date: Date) {
  if (Platform.OS !== "ios" || !nativeModule?.readSleepEntriesForDate) {
    return [] as NativeHealthKitAnchoredSleepEntry[];
  }

  return (await nativeModule.readSleepEntriesForDate(date.toISOString())) ?? [];
}

export async function readNativeHealthKitExerciseEntriesForDate(date: Date) {
  if (Platform.OS !== "ios" || !nativeModule?.readExerciseEntriesForDate) {
    return [] as NativeHealthKitAnchoredExerciseEntry[];
  }

  return (await nativeModule.readExerciseEntriesForDate(date.toISOString())) ?? [];
}
