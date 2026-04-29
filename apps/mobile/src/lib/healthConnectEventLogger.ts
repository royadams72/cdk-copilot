import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";

const STORAGE_KEY = "health-connect:event-log-queue:v1";
const MAX_QUEUED_EVENTS = 200;

export type HealthConnectLogEvent = {
  clientAt?: string;
  deviceId?: string;
  event: string;
  payload?: Record<string, unknown>;
  source: string;
  status?: "error" | "info" | "warn";
  trigger?: string;
};

let flushPromise: Promise<void> | null = null;

function withTimestamp(event: HealthConnectLogEvent) {
  return {
    ...event,
    clientAt: event.clientAt ?? new Date().toISOString(),
    platform: Platform.OS === "ios" ? "ios" : "android",
  };
}

async function readQueue() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [] as ReturnType<typeof withTimestamp>[];
  }

  try {
    const parsed = JSON.parse(raw) as ReturnType<typeof withTimestamp>[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(events: ReturnType<typeof withTimestamp>[]) {
  const trimmed = events.slice(-MAX_QUEUED_EVENTS);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export async function flushHealthConnectEventLogs() {
  if (flushPromise) {
    return flushPromise;
  }

  flushPromise = (async () => {
    try {
      const events = await readQueue();
      if (!events.length) {
        return;
      }

      const response = await authFetch(`${API}/api/users/health-connect/event-log`, {
        body: JSON.stringify({ events }),
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean }
        | null;
      if (!response.ok || !body?.ok) {
        throw new Error("Failed to flush Health Connect event logs");
      }

      await AsyncStorage.removeItem(STORAGE_KEY);
    } finally {
      flushPromise = null;
    }
  })();

  return flushPromise;
}

export async function logHealthConnectEvent(event: HealthConnectLogEvent) {
  try {
    const queue = await readQueue();
    queue.push(withTimestamp(event));
    await writeQueue(queue);
    await flushHealthConnectEventLogs();
  } catch {
    // Best-effort only. Never break sync because telemetry failed.
  }
}
