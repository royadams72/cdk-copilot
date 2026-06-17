import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";

const SLEEP_REMINDER_NOTIFICATION_ID_KEY = "ckd_sleep_morning_reminder_id";
const CARE_PLAN_REMINDER_TYPE = "care-plan-reminder";

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

  // Android debug/dev-client builds in this repo do not ship Firebase config,
  // so Expo push token registration fails noisily during local emulator startup.
  if (Platform.OS === "android" && __DEV__) {
    return false;
  }

  return true;
}

async function ensureNotificationPermission() {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    console.log("[push] permission skipped: unsupported platform", Platform.OS);
    return false;
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  console.log("[push] permission existing", {
    granted: existing.granted,
    platform: Platform.OS,
    status: existing.status,
  });

  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
    console.log("[push] permission requested", {
      granted: requested.granted,
      status: requested.status,
    });
  }

  console.log("[push] permission final", { status });
  return status === "granted";
}

export async function registerForPushNotificationsAsync() {
  if (!shouldAttemptPushRegistration()) {
    console.log("[push] registration skipped by shouldAttemptPushRegistration", {
      dev: __DEV__,
      platform: Platform.OS,
    });
    return null;
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  console.log("[push] register existing permission", {
    granted: existing.granted,
    status: existing.status,
  });

  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
    console.log("[push] register requested permission", {
      granted: requested.granted,
      status: requested.status,
    });
  }

  if (status !== "granted") {
    console.log("[push] registration aborted: permission not granted", {
      status,
    });
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("weekly-reports", {
      importance: Notifications.AndroidImportance.DEFAULT,
      name: "Weekly reports",
    });
    console.log("[push] android notification channel ensured", {
      channel: "weekly-reports",
    });
  }

  const projectId = getProjectId();
  console.log("[push] expo project id", { projectId });
  const token = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  console.log("[push] expo token response", token);

  return token.data;
}

export async function syncPushToken() {
  try {
    const jwt = await SecureStore.getItemAsync("ckd_jwt");
    if (!jwt) {
      console.log("[push] sync skipped: missing jwt");
      return false;
    }

    console.log("[push] sync starting", {
      hasJwt: true,
      platform: getSupportedPlatform(),
    });

    const pushToken = await registerForPushNotificationsAsync();
    if (!pushToken) {
      console.log("[push] sync aborted: no push token returned");
      return false;
    }

    console.log("[push] sync posting token", {
      platform: getSupportedPlatform(),
      pushToken,
      url: `${API}/api/users/push/register`,
    });

    const res = await authFetch(`${API}/api/users/push/register`, {
      body: JSON.stringify({
        platform: getSupportedPlatform(),
        pushToken,
      }),
      method: "POST",
    });

    const responseText = await res.text().catch(() => "");
    console.log("[push] sync register response", {
      ok: res.ok,
      responseText,
      status: res.status,
    });

    return res.ok;
  } catch (error) {
    console.log("[push] syncPushToken failed", error);
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
