jest.mock("react-native-health-connect", () => ({
  ExerciseType: {
    RUNNING: 1,
  },
}));

jest.mock("react-native", () => ({
  NativeModules: {
    HealthConnectBackgroundSync: {},
  },
  Platform: {
    OS: "android",
    select: (options: Record<string, string>) =>
      options.android ?? options.default ?? options.ios,
  },
}));

import {
  buildHealthConnectStepSyncMeta,
  representativeHeartRatePayload,
  toMeasurementPayloads,
} from "@/lib/healthConnectSyncPipeline";

describe("healthConnectSyncPipeline", () => {
  it("deduplicates heart rate samples into stable provider payloads", () => {
    const payloads = toMeasurementPayloads("HeartRate", [
      {
        metadata: {
          dataOrigin: "com.google.android.apps.fitness",
          id: "record-1",
        },
        samples: [
          { beatsPerMinute: 82, time: "2026-06-08T09:00:00.000Z" },
          { beatsPerMinute: 82, time: "2026-06-08T09:00:00.000Z" },
          { beatsPerMinute: 88, time: "2026-06-08T10:00:00.000Z" },
        ],
      },
    ]);

    expect(payloads).toEqual([
      expect.objectContaining({
        bpm: 82,
        externalRecordId:
          "health-connect:com.google.android.apps.fitness:HeartRate:record-1:2026-06-08T09:00:00.000Z",
        kind: "heart_rate",
        measuredAt: "2026-06-08T09:00:00.000Z",
        provider: {
          displayName: "fitness",
          packageName: "com.google.android.apps.fitness",
        },
        source: "provider",
      }),
      expect.objectContaining({
        bpm: 88,
        externalRecordId:
          "health-connect:com.google.android.apps.fitness:HeartRate:record-1:2026-06-08T10:00:00.000Z",
        kind: "heart_rate",
        measuredAt: "2026-06-08T10:00:00.000Z",
      }),
    ]);
  });

  it("builds a representative daily heart rate payload", () => {
    const representative = representativeHeartRatePayload([
      {
        bpm: 70,
        externalRecordId: "health-connect:origin:RestingHeartRate:rest-1",
        kind: "heart_rate",
        measuredAt: "2026-06-08T07:30:00.000Z",
      },
      {
        bpm: 90,
        externalRecordId: "health-connect:origin:HeartRate:sample-2",
        kind: "heart_rate",
        measuredAt: "2026-06-08T11:15:00.000Z",
      },
    ]);

    const expectedMiddayIso = new Date(2026, 5, 8, 12, 0, 0, 0).toISOString();

    expect(representative).toEqual(
      expect.objectContaining({
        bpm: 80,
        externalRecordId:
          "health-connect:origin:RestingHeartRate:rest-1:daily-average",
        kind: "heart_rate",
        measuredAt: expectedMiddayIso,
      }),
    );
  });

  it("builds provisional step sync metadata with a provider marker", () => {
    const meta = buildHealthConnectStepSyncMeta(
      "2026-06-08",
      "provisional",
    );

    expect(meta).toEqual(
      expect.objectContaining({
        dayKey: "2026-06-08",
        provider: "health_connect",
        status: "provisional",
      }),
    );
    expect(meta.lastReconciledAt).toEqual(expect.any(String));
    expect(meta.finalizedAt).toBeUndefined();
  });
});
