export const healthKitRuntimeState: {
  inFlightStepSlotKey: string | null;
  inFlightBackfillWindowKeys: Set<string>;
  healthKitSyncPromise: Promise<void> | null;
  lastHealthKitSyncStartedAt: number;
  lastSyncedStepSlotKey: string | null;
} = {
  healthKitSyncPromise: null,
  inFlightBackfillWindowKeys: new Set<string>(),
  inFlightStepSlotKey: null,
  lastHealthKitSyncStartedAt: 0,
  lastSyncedStepSlotKey: null,
};
