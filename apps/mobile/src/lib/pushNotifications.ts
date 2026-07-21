import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Alert, Platform } from "react-native";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { hasAuthenticatedSessionReady } from "@/lib/authSession";
import { ensureNativeHealthConnectBackgroundSyncScheduled } from "@/lib/healthConnectNativeSync";
import { logHealthConnectEvent } from "@/lib/healthConnectEventLogger";
import { secureStorage } from "@/lib/secureStorage";

const SLEEP_REMINDER_NOTIFICATION_ID_KEY = "ckd_sleep_morning_reminder_id";
const CARE_PLAN_REMINDER_TYPE = "care-plan-reminder";
const CARE_PLAN_ALERT_TYPE = "care-plan-alert";
const CARE_PLAN_COMPLETED_TYPE = "care-plan-completed";
const CARE_PLAN_REMINDER_CHANNEL_ID = "care-plan-reminders";
const CARE_PLAN_REMINDER_HOUR = 9;
const CARE_PLAN_ALERT_STATE_KEY = "ckd_care_plan_alert_state";
type ApiEnvelope<T> = {
  data?: T;
  ok?: boolean;
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

function isMissingApsEnvironmentEntitlement(error: unknown) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";

  return message.includes("aps-environment");
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
    const jwt = await secureStorage.getItem("ckd_jwt");
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
    if (__DEV__ && Platform.OS === "ios" && isMissingApsEnvironmentEntitlement(error)) {
      console.log("syncPushToken skipped: iOS dev build has no APNs entitlement");
      return false;
    }

    console.error("syncPushToken failed", error);
    return false;
  }
}

export async function syncAuthenticatedAppState() {
  if (!hasAuthenticatedSessionReady()) {
    return;
  }

  await ensureNativeHealthConnectBackgroundSyncScheduled();

  await Promise.allSettled([
    syncPushToken(),
    syncCarePlanReminderNotifications(),
    syncSleepReminderNotification(),
  ]);
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

function getStoredStringArray(raw: string | null) {
  try {
    const parsed = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function buildCarePlanNotificationContent(
  item: {
    instructions?: string | null;
    planId: string;
    planTitle: string;
    taskId: string;
    taskLabel: string;
  },
  type: typeof CARE_PLAN_ALERT_TYPE | typeof CARE_PLAN_REMINDER_TYPE,
  taskCountForPlan = 1,
) {
  const plural = taskCountForPlan === 1 ? "" : "s";

  return {
    body:
      type === CARE_PLAN_ALERT_TYPE
        ? taskCountForPlan === 1
          ? item.instructions?.trim() || `New care plan task: ${item.taskLabel}`
          : `${taskCountForPlan} new care plan tasks are ready to review.`
        : item.instructions?.trim() || `Task: ${item.taskLabel}`,
    channelId: CARE_PLAN_REMINDER_CHANNEL_ID,
    data: {
      carePlanId: item.planId,
      screen: `/(dashboard)/care-plan?id=${item.planId}`,
      taskId: item.taskId,
      type,
    },
    sound: true,
    title:
      type === CARE_PLAN_ALERT_TYPE
        ? taskCountForPlan === 1
          ? `New care plan task`
          : `New care plan tasks`
        : `${item.planTitle}: ${item.taskLabel}`,
  } as const;
}

function buildImmediateCarePlanNotificationTrigger() {
  return {
    seconds: 1,
    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
  } as const;
}

async function presentImmediateCarePlanNotification(content: Record<string, unknown>) {
  const presentNotificationAsync = (
    Notifications as typeof Notifications & {
      presentNotificationAsync?: (content: Record<string, unknown>) => Promise<string>;
    }
  ).presentNotificationAsync;

  if (typeof presentNotificationAsync === "function") {
    await presentNotificationAsync(content);
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content,
    trigger: buildImmediateCarePlanNotificationTrigger(),
  });
}

export async function scheduleCarePlanTaskCompletedNotification(args: {
  planId: string;
  planTitle?: string | null;
  taskId: string;
  taskLabel?: string | null;
}) {
  try {
    const hasPermission = await ensureNotificationPermission();
    if (!hasPermission) {
      return false;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CARE_PLAN_REMINDER_CHANNEL_ID, {
        importance: Notifications.AndroidImportance.DEFAULT,
        name: "Care plan reminders",
      });
    }

    await presentImmediateCarePlanNotification({
      body: args.taskLabel?.trim()
        ? `Completed: ${args.taskLabel.trim()}`
        : "You completed a care plan task.",
      channelId: CARE_PLAN_REMINDER_CHANNEL_ID,
      data: {
        carePlanId: args.planId,
        screen: `/(dashboard)/care-plan?id=${args.planId}`,
        taskId: args.taskId,
        type: CARE_PLAN_COMPLETED_TYPE,
      },
      sound: true,
      title: args.planTitle?.trim()
        ? `${args.planTitle.trim()} updated`
        : "Care plan task completed",
    });

    return true;
  } catch (error) {
    console.log("scheduleCarePlanTaskCompletedNotification failed", error);
    return false;
  }
}

async function scheduleImmediateCarePlanNotification(
  item: {
    instructions?: string | null;
    planId: string;
    planTitle: string;
    taskId: string;
    taskLabel: string;
  },
  taskCountForPlan: number,
) {
  await presentImmediateCarePlanNotification(
    buildCarePlanNotificationContent(
      item,
      CARE_PLAN_ALERT_TYPE,
      taskCountForPlan,
    ),
  );
}

function unwrapApiData<T>(raw: unknown, fallback: T): T {
  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const envelope = raw as ApiEnvelope<T>;
  if ("ok" in envelope && "data" in envelope) {
    return (envelope.data ?? fallback) as T;
  }

  return raw as T;
}

function nextMorningDate(baseIso: string | null) {
  const now = new Date();
  const next = baseIso ? new Date(baseIso) : new Date();
  next.setHours(CARE_PLAN_REMINDER_HOUR, 0, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function getWeeklyReminderWeekday(baseIso: string | null) {
  const date = baseIso ? new Date(baseIso) : new Date();
  const utcDay = date.getUTCDay();
  return utcDay === 0 ? 1 : utcDay + 1;
}

export async function syncCarePlanReminderNotifications() {
  try {
    if (Platform.OS !== "ios" && Platform.OS !== "android") {
      return false;
    }

    const jwt = await secureStorage.getItem("ckd_jwt");
    if (!jwt) {
      await cancelCarePlanReminderNotifications();
      await secureStorage.removeItem(CARE_PLAN_ALERT_STATE_KEY);
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

    const raw =
      (await res.json().catch(() => null)) as
        | ApiEnvelope<{
            items?: Array<{
              activatedAt?: string | null;
              freq: "daily" | "weekly" | "once";
              instructions?: string | null;
              planId: string;
              planTitle: string;
              taskId: string;
              taskLabel: string;
            }>;
          }>
        | {
            items?: Array<{
              activatedAt?: string | null;
              freq: "daily" | "weekly" | "once";
              instructions?: string | null;
              planId: string;
              planTitle: string;
              taskId: string;
              taskLabel: string;
            }>;
          }
        | null;
    const data = unwrapApiData(raw, {
      items: [],
    }) as {
      items?: Array<{
        activatedAt?: string | null;
        freq: "daily" | "weekly" | "once";
        instructions?: string | null;
        planId: string;
        planTitle: string;
        taskId: string;
        taskLabel: string;
      }>;
    };

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CARE_PLAN_REMINDER_CHANNEL_ID, {
        importance: Notifications.AndroidImportance.DEFAULT,
        name: "Care plan reminders",
      });
    }

    const items = data?.items ?? [];
    const previousAlertIds = new Set(
      getStoredStringArray(await secureStorage.getItem(CARE_PLAN_ALERT_STATE_KEY)),
    );
    const currentAlertIds = items.map((item) => `${item.planId}:${item.taskId}`);
    const unseenByPlan = new Map<
      string,
      Array<{
        activatedAt?: string | null;
        freq: "daily" | "weekly" | "once";
        instructions?: string | null;
        planId: string;
        planTitle: string;
        taskId: string;
        taskLabel: string;
      }>
    >();

    for (const item of items) {
      const itemId = `${item.planId}:${item.taskId}`;
      if (previousAlertIds.has(itemId)) {
        continue;
      }

      const existing = unseenByPlan.get(item.planId) ?? [];
      existing.push(item);
      unseenByPlan.set(item.planId, existing);
    }

    await cancelCarePlanReminderNotifications();

    for (const [, unseenItems] of unseenByPlan) {
      const firstItem = unseenItems[0];
      if (firstItem) {
        await scheduleImmediateCarePlanNotification(firstItem, unseenItems.length);
      }
    }

    for (const item of items) {
      const content = buildCarePlanNotificationContent(
        item,
        CARE_PLAN_REMINDER_TYPE,
      );

      if (item.freq === "daily") {
        await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            hour: CARE_PLAN_REMINDER_HOUR,
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
            hour: CARE_PLAN_REMINDER_HOUR,
            minute: 0,
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: getWeeklyReminderWeekday(item.activatedAt ?? null),
          },
        });
        continue;
      }

      await Notifications.scheduleNotificationAsync({
        content,
        trigger: nextMorningDate(item.activatedAt ?? null) as never,
      });
    }

    await secureStorage.setItem(
      CARE_PLAN_ALERT_STATE_KEY,
      JSON.stringify(currentAlertIds.sort()),
    );

    return true;
  } catch (error) {
    console.log("syncCarePlanReminderNotifications failed", error);
    return false;
  }
}

async function cancelSleepReminderNotification() {
  const existingId = await secureStorage.getItem(
    SLEEP_REMINDER_NOTIFICATION_ID_KEY,
  );

  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId).catch(
      () => undefined,
    );
    await secureStorage.removeItem(SLEEP_REMINDER_NOTIFICATION_ID_KEY);
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

    const jwt = await secureStorage.getItem("ckd_jwt");
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

    await secureStorage.setItem(
      SLEEP_REMINDER_NOTIFICATION_ID_KEY,
      reminderId,
    );

    return true;
  } catch (error) {
    console.log("syncSleepReminderNotification failed", error);
    return false;
  }
}
