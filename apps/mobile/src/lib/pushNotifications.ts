import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type {
  PatientWorseningTrendAlert,
  PatientWorseningTrendAlertsResponse,
} from "@ckd/core";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";

const SLEEP_REMINDER_NOTIFICATION_ID_KEY = "ckd_sleep_morning_reminder_id";
const CARE_PLAN_REMINDER_TYPE = "care-plan-reminder";
const WORSENING_TREND_REMINDER_TYPE = "worsening-trend-reminder";
const WORSENING_TREND_ALERT_STATE_KEY = "ckd_worsening_trend_alert_state";

type WorseningTrendAlertStateEntry = {
  detectedAt?: string | null;
  lastDeliveredAt?: string | null;
};

type WorseningTrendAlertState = Record<string, WorseningTrendAlertStateEntry>;

type SyncWorseningTrendNotificationsOptions = {
  suppressImmediateAlerts?: boolean;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getProjectId() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    null
  );
}

function getSupportedPlatform() {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
}

function shouldAttemptPushRegistration() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return false;
  }

  return true;
}

async function ensureNotificationPermission() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return false;
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  return status === "granted";
}

export async function registerForPushNotificationsAsync() {
  if (!shouldAttemptPushRegistration()) {
    return null;
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== "granted") {
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("weekly-reports", {
      importance: Notifications.AndroidImportance.DEFAULT,
      name: "Weekly reports",
    });
  }

  const projectId = getProjectId();
  const token = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );

  return token.data;
}

export async function syncPushToken() {
  try {
    const jwt = await SecureStore.getItemAsync("ckd_jwt");
    if (!jwt) {
      return false;
    }

    const pushToken = await registerForPushNotificationsAsync();
    if (!pushToken) {
      return false;
    }

    const res = await authFetch(`${API}/api/users/push/register`, {
      body: JSON.stringify({
        platform: getSupportedPlatform(),
        pushToken,
      }),
      method: "POST",
    });

    return res.ok;
  } catch (error) {
    console.error("syncPushToken failed", error);
    return false;
  }
}

async function cancelCarePlanReminderNotifications() {
  const scheduled =
    await Notifications.getAllScheduledNotificationsAsync().catch(() => []);

  await Promise.all(
    scheduled
      .filter((item) => item.content.data?.type === CARE_PLAN_REMINDER_TYPE)
      .map((item) =>
        Notifications.cancelScheduledNotificationAsync(item.identifier).catch(
          () => undefined,
        ),
      ),
  );
}

async function cancelWorseningTrendNotifications() {
  const scheduled =
    await Notifications.getAllScheduledNotificationsAsync().catch(() => []);

  await Promise.all(
    scheduled
      .filter((item) => item.content.data?.type === WORSENING_TREND_REMINDER_TYPE)
      .map((item) =>
        Notifications.cancelScheduledNotificationAsync(item.identifier).catch(
          () => undefined,
        ),
      ),
  );
}

function parseLocalTime(value: string | null | undefined) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hour, minute] = value.split(":").map((part) => Number(part));
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return { hour, minute };
}

function getWorseningStateItemIds(raw: string | null) {
  try {
    const parsed = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function getWorseningState(raw: string | null): WorseningTrendAlertState {
  try {
    const parsed = JSON.parse(raw ?? "{}") as unknown;
    if (Array.isArray(parsed)) {
      return Object.fromEntries(
        parsed
          .filter((value): value is string => typeof value === "string")
          .map((id) => [id, {}]),
      );
    }
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([id, value]) => {
        if (!value || typeof value !== "object") {
          return [[id, {}]];
        }

        const entry = value as WorseningTrendAlertStateEntry;
        return [
          [
            id,
            {
              detectedAt:
                typeof entry.detectedAt === "string" ? entry.detectedAt : null,
              lastDeliveredAt:
                typeof entry.lastDeliveredAt === "string"
                  ? entry.lastDeliveredAt
                  : null,
            } satisfies WorseningTrendAlertStateEntry,
          ],
        ];
      }),
    );
  } catch {
    return Object.fromEntries(getWorseningStateItemIds(raw).map((id) => [id, {}]));
  }
}

function buildWorseningNotificationContent(
  item: PatientWorseningTrendAlert,
) {
  return {
    body: item.body,
    data: {
      screen: item.screen,
      trendId: item.id,
      trendKey: item.key,
      type: WORSENING_TREND_REMINDER_TYPE,
    },
    sound: true,
    title: item.title,
  } as const;
}

function buildImmediateWorseningNotificationTrigger() {
  return {
    seconds: 1,
    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
  } as const;
}

function nextMorningDate(baseIso: string | null) {
  const now = new Date();
  const next = baseIso ? new Date(baseIso) : new Date();
  next.setHours(8, 0, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

export async function syncCarePlanReminderNotifications() {
  try {
    if (Platform.OS !== "ios" && Platform.OS !== "android") {
      return false;
    }

    const jwt = await SecureStore.getItemAsync("ckd_jwt");
    if (!jwt) {
      await cancelCarePlanReminderNotifications();
      return false;
    }

    const hasPermission = await ensureNotificationPermission();
    if (!hasPermission) {
      return false;
    }

    const res = await authFetch(`${API}/api/care-plans/reminders`);
    if (!res.ok) {
      await cancelCarePlanReminderNotifications();
      return false;
    }

    const data = (await res.json().catch(() => null)) as {
      items?: Array<{
        activatedAt?: string | null;
        freq: "daily" | "weekly" | "once";
        instructions?: string | null;
        planId: string;
        planTitle: string;
        taskId: string;
        taskLabel: string;
      }>;
    } | null;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("care-plan-reminders", {
        importance: Notifications.AndroidImportance.DEFAULT,
        name: "Care plan reminders",
      });
    }

    await cancelCarePlanReminderNotifications();

    for (const item of data?.items ?? []) {
      const content = {
        body: item.instructions?.trim() || `Task: ${item.taskLabel}`,
        data: {
          carePlanId: item.planId,
          screen: `/(dashboard)/care-plan?id=${item.planId}`,
          taskId: item.taskId,
          type: CARE_PLAN_REMINDER_TYPE,
        },
        sound: true,
        title: `${item.planTitle}: ${item.taskLabel}`,
      } as const;

      if (item.freq === "daily") {
        await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            hour: 8,
            minute: 0,
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
          },
        });
        continue;
      }

      if (item.freq === "weekly") {
        await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            hour: 8,
            minute: 0,
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: 2,
          },
        });
        continue;
      }

      await Notifications.scheduleNotificationAsync({
        content,
        trigger: nextMorningDate(item.activatedAt ?? null) as never,
      });
    }

    return true;
  } catch (error) {
    console.log("syncCarePlanReminderNotifications failed", error);
    return false;
  }
}

export async function syncWorseningTrendNotifications(
  options?: SyncWorseningTrendNotificationsOptions,
) {
  try {
    if (Platform.OS !== "ios" && Platform.OS !== "android") {
      return false;
    }

    const jwt = await SecureStore.getItemAsync("ckd_jwt");
    if (!jwt) {
      await cancelWorseningTrendNotifications();
      await SecureStore.deleteItemAsync(WORSENING_TREND_ALERT_STATE_KEY).catch(
        () => undefined,
      );
      return false;
    }

    const hasPermission = await ensureNotificationPermission();
    if (!hasPermission) {
      return false;
    }

    const res = await authFetch(`${API}/api/worsening-trends/active`);
    if (!res.ok) {
      return false;
    }

    const data =
      ((await res.json().catch(() => null)) as PatientWorseningTrendAlertsResponse | null) ??
      { items: [] };

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("worsening-trend-reminders", {
        importance: Notifications.AndroidImportance.DEFAULT,
        name: "Worsening trend reminders",
      });
    }

    const previousState = getWorseningState(
      await SecureStore.getItemAsync(WORSENING_TREND_ALERT_STATE_KEY),
    );
    const currentIds = new Set(data.items.map((item) => item.id));
    const nextState: WorseningTrendAlertState = {};
    const deliveredAtIso = new Date().toISOString();

    for (const item of data.items) {
      const seenEntry = previousState[item.id];
      const suppressImmediateAlert =
        Boolean(options?.suppressImmediateAlerts) && !item.repeatAtLocalTime;

      if (seenEntry) {
        nextState[item.id] = {
          detectedAt: item.detectedAt,
          lastDeliveredAt: seenEntry.lastDeliveredAt ?? null,
        };
        continue;
      }

      if (suppressImmediateAlert) {
        continue;
      }

      await Notifications.scheduleNotificationAsync({
        content: buildWorseningNotificationContent(item),
        trigger: buildImmediateWorseningNotificationTrigger(),
      });
      nextState[item.id] = {
        detectedAt: item.detectedAt,
        lastDeliveredAt: deliveredAtIso,
      };
    }

    await cancelWorseningTrendNotifications();

    for (const item of data.items) {
      const time = parseLocalTime(item.repeatAtLocalTime);
      if (!time) {
        continue;
      }

      if (!nextState[item.id]) {
        const seenEntry = previousState[item.id];
        nextState[item.id] = {
          detectedAt: item.detectedAt,
          lastDeliveredAt: seenEntry?.lastDeliveredAt ?? null,
        };
      }

      await Notifications.scheduleNotificationAsync({
        content: buildWorseningNotificationContent(item),
        trigger: {
          hour: time.hour,
          minute: time.minute,
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
        },
      });
    }

    await SecureStore.setItemAsync(
      WORSENING_TREND_ALERT_STATE_KEY,
      JSON.stringify(
        Object.fromEntries(
          Object.entries(nextState)
            .filter(([id]) => currentIds.has(id))
            .sort(([left], [right]) => left.localeCompare(right)),
        ),
      ),
    );

    return true;
  } catch (error) {
    console.error("syncWorseningTrendNotifications failed", error);
    return false;
  }
}

async function cancelSleepReminderNotification() {
  const existingId = await SecureStore.getItemAsync(
    SLEEP_REMINDER_NOTIFICATION_ID_KEY,
  );

  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(
      () => undefined,
    );
    await SecureStore.deleteItemAsync(SLEEP_REMINDER_NOTIFICATION_ID_KEY);
  }
}

export async function scheduleDevSleepReminderNotification() {
  try {
    if (!__DEV__ || (Platform.OS !== "ios" && Platform.OS !== "android")) {
      return false;
    }

    const hasPermission = await ensureNotificationPermission();
    if (!hasPermission) {
      return false;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("sleep-reminders", {
        importance: Notifications.AndroidImportance.DEFAULT,
        name: "Sleep reminders",
      });
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        body: "Dev test: open sleep logging and verify the reminder flow.",
        data: {
          screen: "/(fitness)/metric-trend?kind=sleep&label=Sleep",
        },
        sound: true,
        title: "Log your sleep",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 5,
      },
    });

    return true;
  } catch (error) {
    console.log("scheduleDevSleepReminderNotification failed", error);
    return false;
  }
}

export async function syncSleepReminderNotification() {
  try {
    if (Platform.OS !== "ios" && Platform.OS !== "android") {
      return false;
    }

    const jwt = await SecureStore.getItemAsync("ckd_jwt");
    if (!jwt) {
      await cancelSleepReminderNotification();
      return false;
    }

    const res = await authFetch(`${API}/api/sleep/reminder-status`);
    if (!res.ok) {
      await cancelSleepReminderNotification();
      return false;
    }

    const data = (await res.json().catch(() => null)) as {
      enabled?: boolean;
      reminderHour?: number;
    } | null;
    const shouldSchedule = data?.enabled === true;

    if (!shouldSchedule) {
      await cancelSleepReminderNotification();
      return false;
    }

    const hasPermission = await ensureNotificationPermission();
    if (!hasPermission) {
      return false;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("sleep-reminders", {
        importance: Notifications.AndroidImportance.DEFAULT,
        name: "Sleep reminders",
      });
    }

    await cancelSleepReminderNotification();

    const reminderId = await Notifications.scheduleNotificationAsync({
      content: {
        body: "Add last night's sleep so your dashboard and weekly summary stay accurate.",
        data: {
          screen: "/(fitness)/metric-trend?kind=sleep&label=Sleep",
        },
        sound: true,
        title: "Log your sleep",
      },
      trigger: {
        hour: typeof data?.reminderHour === "number" ? data.reminderHour : 8,
        minute: 0,
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
      },
    });

    await SecureStore.setItemAsync(
      SLEEP_REMINDER_NOTIFICATION_ID_KEY,
      reminderId,
    );

    return true;
  } catch (error) {
    console.log("syncSleepReminderNotification failed", error);
    return false;
  }
}
