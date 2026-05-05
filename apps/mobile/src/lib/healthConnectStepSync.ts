import { Platform } from "react-native";

import { logHealthConnectEvent } from "@/lib/healthConnectEventLogger";
import {
  loadAndroidStepState,
  readHealthConnectStepSummaryRecordForDate,
} from "@/lib/healthConnectStepSummary";
import { ANDROID_HEALTH_BACKGROUND_READ_PERMISSION } from "@/lib/healthConnectPermissions";
import {
  buildHealthConnectStepSyncMeta,
  createMeasurementDirect,
  localDateKey,
  providerFromPackageName,
  resolvedStepProvider,
} from "@/lib/healthConnectSyncPipeline";
import {
  FOREGROUND_SYNC_INTERVAL_MS,
  invalidateMeasurementCaches,
  stepSyncEventSource,
} from "@/lib/healthConnectSyncCommon";
import { healthConnectRuntimeState } from "@/lib/healthConnectSyncState";

function stepSyncSlotKey(date: Date) {
  const dateKey = localDateKey(date);
  const slot = Math.floor(date.getTime() / FOREGROUND_SYNC_INTERVAL_MS);
  return `${dateKey}:${slot}`;
}

export async function hasHealthConnectBackgroundReadPermission() {
  if (Platform.OS !== "android") {
    return false;
  }

  try {
    const healthConnect = await import("react-native-health-connect");
    const initialized = await healthConnect.initialize();
    if (!initialized) {
      return false;
    }

    const grantedPermissions = await healthConnect.getGrantedPermissions();
    return grantedPermissions.some(
      (permission) =>
        permission.accessType ===
          ANDROID_HEALTH_BACKGROUND_READ_PERMISSION.accessType &&
        permission.recordType ===
          ANDROID_HEALTH_BACKGROUND_READ_PERMISSION.recordType,
    );
  } catch {
    return false;
  }
}

export async function syncTodayStepMeasurement(
  reason: "active" | "background-task" | "background" | "interval" | "mount",
  options: { force?: boolean } = {},
) {
  if (Platform.OS !== "android") {
    return;
  }

  await logHealthConnectEvent({
    event: "steps-sync-start",
    payload: { force: Boolean(options.force) },
    source: stepSyncEventSource(reason),
    status: "info",
    trigger: reason,
  });

  const result = await loadAndroidStepState();
  if (result.status !== "ready" || typeof result.stepsToday !== "number") {
    await logHealthConnectEvent({
      event: "steps-sync-skip-not-ready",
      payload: {
        status: result.status,
        stepsToday:
          typeof result.stepsToday === "number" ? result.stepsToday : null,
      },
      source: stepSyncEventSource(reason),
      status: "warn",
      trigger: reason,
    });
    return;
  }

  const now = new Date();
  const slotKey = stepSyncSlotKey(now);
  if (
    !options.force &&
    (healthConnectRuntimeState.lastSyncedStepSlotKey === slotKey ||
      healthConnectRuntimeState.inFlightStepSlotKey === slotKey)
  ) {
    await logHealthConnectEvent({
      event: "steps-sync-skip-slot",
      payload: { slotKey },
      source: stepSyncEventSource(reason),
      status: "info",
      trigger: reason,
    });
    return;
  }

  const roundedSteps = Math.round(result.stepsToday);
  const dateKey = localDateKey(now);
  const externalRecordId = `health-connect:steps:${dateKey}`;
  const provider = resolvedStepProvider(
    result.selectedDataOrigin,
    result.dataOrigins,
  );
  healthConnectRuntimeState.inFlightStepSlotKey = slotKey;

  try {
    await createMeasurementDirect({
      averageSpeedKph: result.summary?.averageSpeedKph ?? undefined,
      caloriesKcal: result.summary?.caloriesKcal ?? undefined,
      count: roundedSteps,
      distanceMeters: result.summary?.distanceMeters ?? undefined,
      externalRecordId,
      kind: "steps",
      measuredAt: now.toISOString(),
      provider,
      source: "provider",
      sync: buildHealthConnectStepSyncMeta(dateKey, "provisional"),
    });
    invalidateMeasurementCaches("steps");
    healthConnectRuntimeState.lastSyncedStepSlotKey = slotKey;
    await logHealthConnectEvent({
      event: "steps-sync-success",
      payload: {
        dateKey,
        slotKey,
        steps: roundedSteps,
      },
      source: stepSyncEventSource(reason),
      status: "info",
      trigger: reason,
    });
  } catch (error) {
    console.log("Step sync failed", {
      error,
      reason,
    });
    await logHealthConnectEvent({
      event: "steps-sync-fail",
      payload: {
        error: error instanceof Error ? error.message : String(error),
        slotKey,
      },
      source: stepSyncEventSource(reason),
      status: "error",
      trigger: reason,
    });
  } finally {
    if (healthConnectRuntimeState.inFlightStepSlotKey === slotKey) {
      healthConnectRuntimeState.inFlightStepSlotKey = null;
    }
  }
}

export async function backfillHealthConnectStepDates(
  missingDateKeys: string[],
  options: {
    reason?: "steps-screen";
    windowKey: string;
  },
) {
  if (Platform.OS !== "android" || !missingDateKeys.length) {
    return { attempted: 0, resolvedDateKeys: [] as string[], resolvedDays: 0, uploaded: 0 };
  }

  if (healthConnectRuntimeState.inFlightBackfillWindowKeys.has(options.windowKey)) {
    return { attempted: 0, resolvedDateKeys: [] as string[], resolvedDays: 0, uploaded: 0 };
  }

  healthConnectRuntimeState.inFlightBackfillWindowKeys.add(options.windowKey);
  let attempted = 0;
  const resolvedDateKeys: string[] = [];
  let resolvedDays = 0;
  let uploaded = 0;

  try {
    const orderedDateKeys = [...new Set(missingDateKeys)].sort();

    for (const dateKey of orderedDateKeys) {
      const date = new Date(`${dateKey}T12:00:00`);
      if (Number.isNaN(date.getTime())) {
        continue;
      }

      attempted += 1;
      const summary = await readHealthConnectStepSummaryRecordForDate(date);
      if (!summary) {
        continue;
      }

      const measuredAt = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        12,
        0,
        0,
        0,
      ).toISOString();

      await createMeasurementDirect({
        averageSpeedKph: summary.averageSpeedKph ?? undefined,
        caloriesKcal: summary.caloriesKcal ?? undefined,
        count: Math.max(0, Math.round(summary.steps ?? 0)),
        distanceMeters: summary.distanceMeters ?? undefined,
        externalRecordId: `health-connect:steps:${dateKey}`,
        kind: "steps",
        measuredAt,
        provider: providerFromPackageName(summary.selectedDataOrigin),
        source: "provider",
        sync: buildHealthConnectStepSyncMeta(dateKey, "finalized"),
      });
      resolvedDateKeys.push(dateKey);
      resolvedDays += 1;
      uploaded += 1;
    }

    if (uploaded > 0) {
      invalidateMeasurementCaches("steps", { includeHistory: true });
    }

    return { attempted, resolvedDateKeys, resolvedDays, uploaded };
  } finally {
    healthConnectRuntimeState.inFlightBackfillWindowKeys.delete(options.windowKey);
  }
}
