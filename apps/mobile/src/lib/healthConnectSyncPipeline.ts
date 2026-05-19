import { ExerciseType } from "react-native-health-connect";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import type {
  CreateMeasurementArgs,
  MeasurementSyncMeta,
} from "@/store/services/types";

export type HealthRecordType =
  | "BloodPressure"
  | "ExerciseSession"
  | "HeartRate"
  | "RestingHeartRate"
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

export type HealthRecord = {
  beatsPerMinute?: number;
  caloriesKcal?: number;
  diastolic?: { inMillimetersOfMercury?: number; value?: number };
  endTime?: string;
  exerciseType?: number;
  metadata?: HealthMetadata;
  samples?: { beatsPerMinute?: number; time?: string }[];
  startTime?: string;
  systolic?: { inMillimetersOfMercury?: number; value?: number };
  time?: string;
  title?: string;
};

const EXERCISE_TYPE_LABELS = Object.entries(ExerciseType).reduce<
  Record<number, string>
>((acc, [key, value]) => {
  if (typeof value !== "number") {
    return acc;
  }
  acc[value] = key
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return acc;
}, {});

export function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function createMeasurementDirect(payload: CreateMeasurementArgs) {
  const response = await authFetch(`${API}/api/measurements/create`, {
    body: JSON.stringify(payload),
    method: "POST",
  });
  const body = (await response.json().catch(() => null)) as
    | { message?: string; ok?: boolean }
    | null;

  if (!response.ok || !body?.ok) {
    throw new Error(body?.message ?? "Failed to create measurement");
  }

  return body;
}

export async function measurementsBatchUpsert(payloads: CreateMeasurementArgs[]) {
  const items = payloads.map((p) => {
    const item: Record<string, unknown> = {
      externalRecordId: p.externalRecordId,
      kind: p.kind,
      measuredAt: p.measuredAt,
      provider: p.provider,
    };
    if (p.device) item.device = p.device;

    if (p.kind === "heart_rate") item.bpm = p.bpm;
    if (p.kind === "sleep") {
      item.sleepFromAt = p.sleepFromAt;
      item.sleepToAt = p.sleepToAt;
      item.durationMin = p.durationMin;
    }
    if (p.kind === "exercise") {
      item.durationMin = p.durationMin;
      item.caloriesKcal = p.caloriesKcal;
      item.exerciseId = p.exerciseId;
      item.exerciseTitle = p.exerciseTitle;
      item.category = p.category;
      item.intensity = p.intensity;
      item.met = p.met;
    }
    if (p.kind === "blood_pressure") {
      item.systolicMmHg = p.systolicMmHg;
      item.diastolicMmHg = p.diastolicMmHg;
    }
    return item;
  });

  const response = await authFetch(`${API}/api/measurements/provider-batch-upsert`, {
    body: JSON.stringify({ items }),
    method: "POST",
  });
  const body = (await response.json().catch(() => null)) as
    | { message?: string; ok?: boolean }
    | null;

  if (!response.ok || !body?.ok) {
    throw new Error(body?.message ?? "Batch upsert failed");
  }
}

export function buildHealthConnectStepSyncMeta(
  dayKey: string,
  status: "finalized" | "provisional",
): MeasurementSyncMeta {
  const reconciledAt = new Date().toISOString();
  return {
    dayKey,
    finalizedAt: status === "finalized" ? reconciledAt : undefined,
    lastReconciledAt: reconciledAt,
    provider: "health_connect",
    status,
  };
}

export function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function isHealthConnectQuotaError(error: unknown) {
  return toErrorMessage(error).includes("API call quota exceeded");
}

function providerPackageName(metadata?: HealthMetadata) {
  return metadata?.dataOrigin?.trim() || "android.healthconnect";
}

function providerDisplayName(packageName: string) {
  return packageName.split(".").filter(Boolean).at(-1) ?? packageName;
}

export function resolvedStepProvider(
  selectedDataOrigin: string | null,
  dataOrigins: string[],
) {
  const packageName =
    selectedDataOrigin?.trim() ||
    dataOrigins.find((origin) => origin && origin !== "android") ||
    dataOrigins[0] ||
    "android.healthconnect";

  return {
    displayName: providerDisplayName(packageName),
    packageName,
  };
}

export function providerFromPackageName(packageName: string | null) {
  const resolvedPackageName = packageName?.trim() || "android.healthconnect";
  return {
    displayName: providerDisplayName(resolvedPackageName),
    packageName: resolvedPackageName,
  };
}

function externalRecordId(
  recordType: HealthRecordType,
  record: HealthRecord,
  fallbackTime: string,
  sampleKey?: string,
) {
  const origin = providerPackageName(record.metadata);
  const recordId =
    record.metadata?.id?.trim() || record.metadata?.clientRecordId?.trim();
  const suffix = sampleKey?.trim();
  if (recordId) {
    return suffix
      ? `health-connect:${origin}:${recordType}:${recordId}:${suffix}`
      : `health-connect:${origin}:${recordType}:${recordId}`;
  }
  return suffix
    ? `health-connect:${origin}:${recordType}:${fallbackTime}:${suffix}`
    : `health-connect:${origin}:${recordType}:${fallbackTime}`;
}

function provenance(
  recordType: HealthRecordType,
  record: HealthRecord,
  time: string,
  sampleKey?: string,
) {
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
    externalRecordId: externalRecordId(recordType, record, time, sampleKey),
    provider: {
      displayName: providerDisplayName(packageName),
      packageName,
    },
    source: "provider" as const,
  };
}

function pressureValue(value?: {
  inMillimetersOfMercury?: number;
  value?: number;
}) {
  return value?.inMillimetersOfMercury ?? value?.value ?? null;
}

function durationMinutes(startTime?: string, endTime?: string) {
  if (!startTime || !endTime) return null;
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function exerciseTitle(record: HealthRecord) {
  const explicitTitle = record.title?.trim();
  if (explicitTitle) {
    return explicitTitle;
  }
  if (typeof record.exerciseType === "number") {
    return EXERCISE_TYPE_LABELS[record.exerciseType] ?? "Imported exercise";
  }
  return "Imported exercise";
}

export function heartRateRecordSampleTimes(record: HealthRecord) {
  return (record.samples ?? [])
    .map((sample) => sample.time)
    .filter((time): time is string => typeof time === "string")
    .sort((a, b) => a.localeCompare(b));
}

function heartRateSamples(record: HealthRecord) {
  const samples = record.samples ?? [];
  const seen = new Set<string>();

  return samples
    .filter(
      (sample) =>
        typeof sample.beatsPerMinute === "number" &&
        Number.isFinite(sample.beatsPerMinute) &&
        typeof sample.time === "string",
    )
    .sort((a, b) => String(a.time).localeCompare(String(b.time)))
    .filter((sample) => {
      const key = `${sample.time}:${sample.beatsPerMinute}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

export function toMeasurementPayloads(
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
      for (const sample of heartRateSamples(record)) {
        if (!sample.time || !sample.beatsPerMinute) continue;
        payloads.push({
          ...provenance(recordType, record, sample.time, sample.time),
          bpm: Math.round(sample.beatsPerMinute),
          kind: "heart_rate",
          measuredAt: sample.time,
        });
      }
      continue;
    }

    if (recordType === "RestingHeartRate") {
      if (!record.time || !record.beatsPerMinute) continue;
      payloads.push({
        ...provenance(recordType, record, record.time),
        bpm: Math.round(record.beatsPerMinute),
        kind: "heart_rate",
        measuredAt: record.time,
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
      exerciseTitle: exerciseTitle(record),
      intensity: "moderate",
      kind: "exercise",
      measuredAt: record.endTime,
      met: 1,
    });
  }

  return payloads;
}

export async function readRecentRecords(
  healthConnect: typeof import("react-native-health-connect"),
  recordType: HealthRecordType,
  timeRange: {
    endTime: string;
    startTime: string;
  },
) {
  let pageToken: string | undefined;
  const records: HealthRecord[] = [];

  do {
    const result = await healthConnect.readRecords(recordType, {
      ascendingOrder: true,
      pageSize: 100,
      pageToken,
      timeRangeFilter: {
        endTime: timeRange.endTime,
        operator: "between",
        startTime: timeRange.startTime,
      },
    });
    records.push(...(result.records as HealthRecord[]));
    pageToken = result.pageToken;
  } while (pageToken);

  return records;
}

export function dayRangeForDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const start = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return {
    endTime: end.toISOString(),
    startTime: start.toISOString(),
  };
}

export function representativeHeartRatePayload(
  payloads: CreateMeasurementArgs[],
) {
  const heartRatePayloads = payloads.filter(
    (payload): payload is CreateMeasurementArgs & { bpm: number; measuredAt: string } =>
      payload.kind === "heart_rate" &&
      typeof payload.bpm === "number" &&
      Number.isFinite(payload.bpm) &&
      typeof payload.measuredAt === "string",
  );

  if (!heartRatePayloads.length) {
    return null;
  }

  const totalBpm = heartRatePayloads.reduce((sum, payload) => sum + payload.bpm, 0);
  const averageBpm = Math.round(totalBpm / heartRatePayloads.length);
  const representativeSource =
    heartRatePayloads.find((payload) =>
      payload.externalRecordId?.includes(":RestingHeartRate:"),
    ) ?? heartRatePayloads[heartRatePayloads.length - 1];
  const sampleDate = new Date(representativeSource.measuredAt);
  if (Number.isNaN(sampleDate.getTime())) {
    return {
      ...representativeSource,
      bpm: averageBpm,
      measuredAt: representativeSource.measuredAt,
    };
  }

  const middayMeasuredAt = new Date(
    sampleDate.getFullYear(),
    sampleDate.getMonth(),
    sampleDate.getDate(),
    12,
    0,
    0,
    0,
  ).toISOString();

  return {
    ...representativeSource,
    bpm: averageBpm,
    externalRecordId: representativeSource.externalRecordId
      ? `${representativeSource.externalRecordId}:daily-average`
      : representativeSource.externalRecordId,
    measuredAt: middayMeasuredAt,
  };
}
