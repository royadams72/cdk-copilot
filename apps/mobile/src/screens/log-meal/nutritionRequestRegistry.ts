const RECENT_REQUEST_TTL_MS = 5000;

const recentNutritionRequests = new Map<string, number>();

export function buildNutritionRequestKey(
  uid: string | undefined,
  quantity: number,
  unit: string | null | undefined,
) {
  return [uid ?? "", quantity, (unit ?? "").trim().toLowerCase()].join("|");
}

export function reserveRecentNutritionRequests(keys: string[]) {
  pruneExpiredNutritionRequests();
  const now = Date.now();

  for (const key of keys) {
    recentNutritionRequests.set(key, now + RECENT_REQUEST_TTL_MS);
  }
}

export function filterUnreservedNutritionKeys<T>(
  items: T[],
  getKey: (item: T) => string | null,
) {
  pruneExpiredNutritionRequests();

  return items.filter((item) => {
    const key = getKey(item);
    if (!key) return false;

    const expiresAt = recentNutritionRequests.get(key);
    return !expiresAt || expiresAt <= Date.now();
  });
}

export function releaseRecentNutritionRequests(keys: string[]) {
  for (const key of keys) {
    recentNutritionRequests.delete(key);
  }
}

function pruneExpiredNutritionRequests() {
  const now = Date.now();

  for (const [key, expiresAt] of recentNutritionRequests.entries()) {
    if (expiresAt <= now) {
      recentNutritionRequests.delete(key);
    }
  }
}
