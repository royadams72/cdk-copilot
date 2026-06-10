export const HEALTH_SYNC_PROVIDERS = ["health_connect", "healthkit"] as const;

export type HealthSyncProvider = (typeof HEALTH_SYNC_PROVIDERS)[number];

export function isHealthSyncProvider(
  value: unknown,
): value is HealthSyncProvider {
  return (
    typeof value === "string" &&
    HEALTH_SYNC_PROVIDERS.includes(value as HealthSyncProvider)
  );
}

export function parseHealthSyncProvider(
  value: unknown,
  fallback: HealthSyncProvider = "health_connect",
): HealthSyncProvider {
  return isHealthSyncProvider(value) ? value : fallback;
}
