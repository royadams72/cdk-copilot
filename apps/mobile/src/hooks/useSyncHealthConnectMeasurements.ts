import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";

import { useCreateMeasurementMutation } from "@/store/services/dashboardApi";
import type { CreateMeasurementArgs } from "@/store/services/types";

const HEALTH_RECORD_PERMISSIONS = [
  { accessType: "read", recordType: "BloodPressure" },
  { accessType: "read", recordType: "ExerciseSession" },
  { accessType: "read", recordType: "HeartRate" },
  { accessType: "read", recordType: "SleepSession" },
] as const;

type HealthRecordType =
  | "BloodPressure"
  | "ExerciseSession"
  | "HeartRate"
  | "SleepSession";

type HealthMetadata = {
  clientRecordId?: string;
  dataOrigin?: string;
  device?: {
    manufacturer?: string;
    model?: string;
    type?: number;
  };
  id?: string;
};

type HealthRecord = {
  caloriesKcal?: number;
  diastolic?: { inMillimetersOfMercury?: number; value?: number };
  endTime?: string;
  exerciseType?: number;
  metadata?: HealthMetadata;
  samples?: Array<{ beatsPerMinute?: number; time?: string }>;
  startTime?: string;
  systolic?: { inMillimetersOfMercury?: number; value?: number };
  time?: string;
  title?: string;
};

function startOfRecentWindow() {
  const start = new Date();
  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);
  return start;
}

function providerPackageName(metadata?: HealthMetadata) {
  return metadata?.dataOrigin?.trim() || "android.healthconnect";
}

function providerDisplayName(packageName: string) {
  return packageName.split(".").filter(Boolean).at(-1) ?? packageName;
}

function externalRecordId(
  recordType: HealthRecordType,
  record: HealthRecord,
  fallbackTime: string,
) {
  const origin = providerPackageName(record.metadata);
  const recordId =
    record.metadata?.id?.trim() || record.metadata?.clientRecordId?.trim();
  if (recordId) return `health-connect:${origin}:${recordType}:${recordId}`;
  return `health-connect:${origin}:${recordType}:${fallbackTime}`;
}

function provenance(recordType: HealthRecordType, record: HealthRecord, time: string) {
  const packageName = providerPackageName(record.metadata);
  const manufacturer = record.metadata?.device?.manufacturer?.trim();
  const model = record.metadata?.device?.model?.trim();

  return {
    device:
      manufacturer || model
        ? {
            externalId: [packageName, manufacturer, model]
              .filter(Boolean)
              .join(":"),
            name: [manufacturer, model].filter(Boolean).join(" "),
            platform: "Health Connect",
          }
        : undefined,
    externalRecordId: externalRecordId(recordType, record, time),
    provider: {
      displayName: providerDisplayName(packageName),
      packageName,
    },
    source: "provider" as const,
  };
}

function pressureValue(value?: { inMillimetersOfMercury?: number; value?: number }) {
  return value?.inMillimetersOfMercury ?? value?.value ?? null;
}

function durationMinutes(startTime?: string, endTime?: string) {
  if (!startTime || !endTime) return null;
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function latestHeartRateSample(record: HealthRecord) {
  const samples = record.samples ?? [];
  return samples
    .filter(
      (sample) =>
        typeof sample.beatsPerMinute === "number" &&
        typeof sample.time === "string",
    )
    .sort((a, b) => String(a.time).localeCompare(String(b.time)))
    .at(-1);
}

function toMeasurementPayloads(
  recordType: HealthRecordType,
  records: HealthRecord[],
): CreateMeasurementArgs[] {
  const payloads: CreateMeasurementArgs[] = [];

  for (const record of records) {
    if (recordType === "BloodPressure") {
      const measuredAt = record.time;
      const systolic = pressureValue(record.systolic);
      const diastolic = pressureValue(record.diastolic);
      if (!measuredAt || !systolic || !diastolic) continue;
      payloads.push({
        ...provenance(recordType, record, measuredAt),
        diastolicMmHg: Math.round(diastolic),
        kind: "blood_pressure",
        measuredAt,
        systolicMmHg: Math.round(systolic),
      });
      continue;
    }

    if (recordType === "HeartRate") {
      const sample = latestHeartRateSample(record);
      if (!sample?.time || !sample.beatsPerMinute) continue;
      payloads.push({
        ...provenance(recordType, record, sample.time),
        bpm: Math.round(sample.beatsPerMinute),
        kind: "heart_rate",
        measuredAt: sample.time,
      });
      continue;
    }

    if (recordType === "SleepSession") {
      const durationMin = durationMinutes(record.startTime, record.endTime);
      if (!record.startTime || !record.endTime || !durationMin) continue;
      payloads.push({
        ...provenance(recordType, record, record.endTime),
        durationMin,
        kind: "sleep",
        measuredAt: record.endTime,
        sleepFromAt: record.startTime,
        sleepToAt: record.endTime,
      });
      continue;
    }

    const durationMin = durationMinutes(record.startTime, record.endTime);
    if (!record.startTime || !record.endTime || !durationMin) continue;
    payloads.push({
      ...provenance(recordType, record, record.endTime),
      caloriesKcal: Math.max(0, Math.round(record.caloriesKcal ?? 0)),
      category: "health_connect",
      durationMin,
      exerciseId: `health_connect_${record.exerciseType ?? "exercise"}`,
      exerciseTitle: record.title?.trim() || "Imported exercise",
      intensity: "moderate",
      kind: "exercise",
      measuredAt: record.endTime,
      met: 1,
    });
  }

  return payloads;
}

async function readRecentRecords(
  healthConnect: typeof import("react-native-health-connect"),
  recordType: HealthRecordType,
) {
  let pageToken: string | undefined;
  const records: HealthRecord[] = [];

  do {
    const result = await healthConnect.readRecords(recordType, {
      ascendingOrder: true,
      pageSize: 100,
      pageToken,
      timeRangeFilter: {
        operator: "between",
        startTime: startOfRecentWindow().toISOString(),
        endTime: new Date().toISOString(),
      },
    });
    records.push(...(result.records as HealthRecord[]));
    pageToken = result.pageToken;
  } while (pageToken);

  return records;
}

export function useSyncHealthConnectMeasurements(enabled: boolean) {
  const [createMeasurement] = useCreateMeasurementMutation();
  const syncedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || Platform.OS !== "android") return;

    let cancelled = false;

    const sync = async () => {
      try {
        const healthConnect = await import("react-native-health-connect");
        const initialized = await healthConnect.initialize();
        if (!initialized || cancelled) return;

        const grantedPermissions = await healthConnect.getGrantedPermissions();
        const granted = new Set(
          grantedPermissions.map(
            (permission) =>
              `${permission.accessType}:${permission.recordType}`,
          ),
        );

        for (const permission of HEALTH_RECORD_PERMISSIONS) {
          if (
            !granted.has(`${permission.accessType}:${permission.recordType}`)
          ) {
            continue;
          }

          const recordType = permission.recordType as HealthRecordType;
          const records = await readRecentRecords(healthConnect, recordType);
          const payloads = toMeasurementPayloads(recordType, records);

          for (const payload of payloads) {
            if (!payload.externalRecordId) continue;
            const syncKey = `${payload.externalRecordId}:${payload.measuredAt}`;
            if (syncedRef.current.has(syncKey)) continue;
            await createMeasurement(payload).unwrap();
            syncedRef.current.add(syncKey);
          }
        }
      } catch (error) {
        console.log("Health Connect sync failed", error);
      }
    };

    void sync();
    const interval = setInterval(() => {
      void sync();
    }, 5 * 60_000);
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void sync();
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [createMeasurement, enabled]);
}
