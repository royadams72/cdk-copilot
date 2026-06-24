const mockReadNativeHealthKitStepSummaryForDate = jest.fn();
const mockReadNativeHealthKitHeartRateEntriesForDate = jest.fn();
const mockReadNativeHealthKitBloodPressureEntriesForDate = jest.fn();
const mockReadNativeHealthKitSleepEntriesForDate = jest.fn();
const mockReadNativeHealthKitExerciseEntriesForDate = jest.fn();
const mockSyncWorseningTrendNotifications = jest.fn(async () => true);
const mockCreateMeasurementDirect = jest.fn();
const mockMeasurementsBatchUpsert = jest.fn();
const mockInvalidateMeasurementCaches = jest.fn();
const mockRepresentativeHeartRatePayload = jest.fn();

jest.mock("@/lib/healthKitNativeBridge", () => ({
  consumeNativeHealthKitPendingObserverTypes: jest.fn(),
  getNativeHealthKitStatus: jest.fn(),
  readNativeHealthKitAnchoredBloodPressureChanges: jest.fn(),
  readNativeHealthKitAnchoredExerciseChanges: jest.fn(),
  readNativeHealthKitAnchoredHeartRateChanges: jest.fn(),
  readNativeHealthKitAnchoredSleepChanges: jest.fn(),
  readNativeHealthKitBloodPressureEntriesForDate:
    mockReadNativeHealthKitBloodPressureEntriesForDate,
  readNativeHealthKitExerciseEntriesForDate:
    mockReadNativeHealthKitExerciseEntriesForDate,
  readNativeHealthKitHeartRateEntriesForDate:
    mockReadNativeHealthKitHeartRateEntriesForDate,
  readNativeHealthKitHourlyStepCountsForDate: jest.fn(),
  readNativeHealthKitSleepEntriesForDate: mockReadNativeHealthKitSleepEntriesForDate,
  readNativeHealthKitStepSummaryForDate: mockReadNativeHealthKitStepSummaryForDate,
}));

jest.mock("@/lib/healthConnectEventLogger", () => ({
  logHealthConnectEvent: jest.fn(),
}));

jest.mock("@/lib/pushNotifications", () => ({
  syncWorseningTrendNotifications: mockSyncWorseningTrendNotifications,
}));

jest.mock("@/lib/healthConnectSyncPipeline", () => ({
  createMeasurementDirect: mockCreateMeasurementDirect,
  localDateKey: (date: Date) => date.toISOString().slice(0, 10),
  measurementsBatchUpsert: mockMeasurementsBatchUpsert,
  representativeHeartRatePayload: mockRepresentativeHeartRatePayload,
}));

jest.mock("@/lib/healthConnectSyncCommon", () => ({
  MIN_BACKGROUND_SYNC_INTERVAL_MS: 15 * 60 * 1000,
  getServerHealthConnectSyncState: jest.fn(),
  invalidateMeasurementCaches: mockInvalidateMeasurementCaches,
  measurementSyncEventSource: jest.fn(() => "measurement-sync-test"),
  stepSyncEventSource: jest.fn(() => "step-sync-test"),
  updateServerHealthConnectSyncState: jest.fn(),
}));

import {
  backfillHealthKitMeasurementDates,
  backfillHealthKitStepDates,
} from "@/lib/healthKitMeasurementSync";
import { healthKitRuntimeState } from "@/lib/healthKitSyncState";

describe("healthKitMeasurementSync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    healthKitRuntimeState.inFlightBackfillWindowKeys.clear();
  });

  it("backfills unique iOS step dates through direct measurement writes", async () => {
    mockReadNativeHealthKitStepSummaryForDate.mockImplementation(async (date: Date) => {
      const dayKey = date.toISOString().slice(0, 10);
      if (dayKey === "2026-06-07") {
        return {
          averageSpeedKph: 4.1,
          caloriesKcal: 210,
          distanceMeters: 3100,
          steps: 4321,
        };
      }

      return {
        averageSpeedKph: null,
        caloriesKcal: null,
        distanceMeters: null,
        steps: 0,
      };
    });

    const result = await backfillHealthKitStepDates(
      ["2026-06-07", "2026-06-07", "2026-06-08"],
      { windowKey: "steps:2026-06" },
    );

    expect(result).toEqual({
      attempted: 2,
      resolvedDateKeys: ["2026-06-07"],
      resolvedDays: 1,
      uploaded: 1,
    });
    expect(mockCreateMeasurementDirect).toHaveBeenCalledTimes(1);
    expect(mockCreateMeasurementDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 4321,
        externalRecordId: "healthkit:steps:2026-06-07",
        kind: "steps",
        provider: {
          displayName: "Apple Health",
          packageName: "apple.healthkit",
        },
        source: "provider",
        sync: expect.objectContaining({
          dayKey: "2026-06-07",
          provider: "healthkit",
          status: "finalized",
        }),
      }),
    );
    expect(mockInvalidateMeasurementCaches).toHaveBeenCalledWith("steps", {
      includeHistory: true,
    });
  });

  it("backfills heart rate dates via representative daily provider payloads", async () => {
    mockReadNativeHealthKitHeartRateEntriesForDate.mockResolvedValue([
      {
        measuredAt: "2026-06-07T08:00:00.000Z",
        value: 72,
        value2: null,
      },
      {
        measuredAt: "2026-06-07T14:00:00.000Z",
        value: 88,
        value2: null,
      },
    ]);
    mockRepresentativeHeartRatePayload.mockImplementation((payloads) =>
      payloads.length
        ? {
            ...payloads[0],
            bpm: 80,
            externalRecordId: `${payloads[0].externalRecordId}:daily-average`,
          }
        : null,
    );

    const result = await backfillHealthKitMeasurementDates(
      "heart_rate",
      ["2026-06-07"],
      { windowKey: "heart-rate:2026-06" },
    );

    expect(result).toEqual({
      attempted: 1,
      resolvedDays: 1,
      uploaded: 1,
    });
    expect(mockMeasurementsBatchUpsert).toHaveBeenCalledWith([
      expect.objectContaining({
        bpm: 80,
        externalRecordId:
          "healthkit:apple.healthkit:heart_rate:2026-06-07T08:00:00.000Z:daily-average",
        kind: "heart_rate",
        provider: {
          displayName: "Apple Health",
          packageName: "apple.healthkit",
        },
      }),
    ]);
    expect(mockInvalidateMeasurementCaches).toHaveBeenCalledWith("heart_rate", {
      includeHistory: true,
    });
  });

  it("skips overlapping measurement backfills for the same window", async () => {
    healthKitRuntimeState.inFlightBackfillWindowKeys.add("sleep:window-1");

    const result = await backfillHealthKitMeasurementDates("sleep", ["2026-06-07"], {
      windowKey: "window-1",
    });

    expect(result).toEqual({
      attempted: 0,
      resolvedDays: 0,
      uploaded: 0,
    });
    expect(mockReadNativeHealthKitSleepEntriesForDate).not.toHaveBeenCalled();
    expect(mockMeasurementsBatchUpsert).not.toHaveBeenCalled();
  });
});
