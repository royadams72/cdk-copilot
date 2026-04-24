import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";

const SLEEP_REMINDER_NOTIFICATION_ID_KEY = "ckd_sleep_morning_reminder_id";

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
    console.log("syncPushToken failed", error);
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

    const data = (await res.json().catch(() => null)) as
      | {
          enabled?: boolean;
          reminderHour?: number;
        }
      | null;
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
        hour:
          typeof data?.reminderHour === "number" ? data.reminderHour : 8,
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
