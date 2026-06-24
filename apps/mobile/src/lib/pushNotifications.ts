import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Alert, Platform } from "react-native";
import type {
  PatientWorseningTrendAlert,
  PatientWorseningTrendAlertsResponse,
} from "@ckd/core";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";

const SLEEP_REMINDER_NOTIFICATION_ID_KEY = "ckd_sleep_morning_reminder_id";
const CARE_PLAN_REMINDER_TYPE = "care-plan-reminder";
const CARE_PLAN_REMINDER_CHANNEL_ID = "care-plan-reminders";
const WORSENING_TREND_ALERT_TYPE = "worsening-trend-alert";
const WORSENING_TREND_REMINDER_TYPE = "worsening-trend-reminder";
const WORSENING_TREND_ALERT_STATE_KEY = "ckd_worsening_trend_alert_state";
const WORSENING_TREND_ALERT_CHANNEL_ID = "worsening-trend-alerts";
const WORSENING_TREND_REMINDER_CHANNEL_ID = "worsening-trend-reminders";
const deliveredWorseningAlertIdsInSession = new Map<string, string>();

type WorseningTrendAlertStateEntry = {
  detectedAt?: string | null;
  lastDeliveredAt?: string | null;
};

type WorseningTrendAlertState = Record<string, WorseningTrendAlertStateEntry>;

type SyncWorseningTrendNotificationsOptions = {
  suppressImmediateAlerts?: boolean;
};

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
  notificationType: string,
) {
  return {
    body: item.body,
    channelId:
      notificationType === WORSENING_TREND_ALERT_TYPE
        ? WORSENING_TREND_ALERT_CHANNEL_ID
        : WORSENING_TREND_REMINDER_CHANNEL_ID,
    data: {
      screen: item.screen,
      trendId: item.id,
      trendKey: item.key,
      type: notificationType,
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

async function presentImmediateWorseningNotification(
  item: PatientWorseningTrendAlert,
) {
  const content = buildWorseningNotificationContent(
    item,
    WORSENING_TREND_ALERT_TYPE,
  );
  console.log("[worsening] present start", {
    id: item.id,
    key: item.key,
    title: item.title,
  });
  Alert.alert(item.title, item.body);
  const presentNotificationAsync = (
    Notifications as typeof Notifications & {
      presentNotificationAsync?: (content: Record<string, unknown>) => Promise<string>;
    }
  ).presentNotificationAsync;

  if (typeof presentNotificationAsync === "function") {
    await presentNotificationAsync(content);
    console.log("[worsening] present direct success", {
      id: item.id,
      key: item.key,
    });
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content,
    trigger: buildImmediateWorseningNotificationTrigger(),
  });
  console.log("[worsening] present fallback schedule success", {
    id: item.id,
    key: item.key,
  });
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

    await cancelCarePlanReminderNotifications();

    for (const item of data?.items ?? []) {
      const content = {
        body: item.instructions?.trim() || `Task: ${item.taskLabel}`,
        channelId: CARE_PLAN_REMINDER_CHANNEL_ID,
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

    const raw =
      (await res.json().catch(() => null)) as
        | ApiEnvelope<PatientWorseningTrendAlertsResponse>
        | PatientWorseningTrendAlertsResponse
        | null;
    const data = unwrapApiData<PatientWorseningTrendAlertsResponse>(raw, {
      items: [],
    });
    console.log("[worsening] active response", {
      itemCount: data.items?.length ?? 0,
      items: (data.items ?? []).map((item) => ({
        detectedAt: item.detectedAt,
        id: item.id,
        key: item.key,
        repeatAtLocalTime: item.repeatAtLocalTime ?? null,
        title: item.title,
      })),
      suppressImmediateAlerts: Boolean(options?.suppressImmediateAlerts),
    });

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(
        WORSENING_TREND_ALERT_CHANNEL_ID,
        {
          importance: Notifications.AndroidImportance.HIGH,
          name: "Worsening trend alerts",
        },
      );
      await Notifications.setNotificationChannelAsync(
        WORSENING_TREND_REMINDER_CHANNEL_ID,
        {
        importance: Notifications.AndroidImportance.DEFAULT,
        name: "Worsening trend reminders",
        },
      );
    }

    const previousState = getWorseningState(
      await SecureStore.getItemAsync(WORSENING_TREND_ALERT_STATE_KEY),
    );
    console.log("[worsening] previous state", previousState);
    const items = data.items ?? [];
    const currentIds = new Set(items.map((item) => item.id));
    const nextState: WorseningTrendAlertState = {};
    const deliveredAtIso = new Date().toISOString();

    for (const item of items) {
      const seenEntry = previousState[item.id];
      const deliveredInSessionAt =
        deliveredWorseningAlertIdsInSession.get(item.id) ?? null;
      const suppressImmediateAlert =
        Boolean(options?.suppressImmediateAlerts) && !item.repeatAtLocalTime;
      console.log("[worsening] evaluate item", {
        deliveredInSessionAt,
        id: item.id,
        key: item.key,
        seenEntry: seenEntry ?? null,
        suppressImmediateAlert,
      });

      if (seenEntry) {
        nextState[item.id] = {
          detectedAt: item.detectedAt,
          lastDeliveredAt: seenEntry.lastDeliveredAt ?? null,
        };
        console.log("[worsening] skip seen item", {
          id: item.id,
          key: item.key,
        });
        continue;
      }

      if (deliveredInSessionAt) {
        nextState[item.id] = {
          detectedAt: item.detectedAt,
          lastDeliveredAt: deliveredInSessionAt,
        };
        console.log("[worsening] skip delivered in session", {
          deliveredInSessionAt,
          id: item.id,
          key: item.key,
        });
        continue;
      }

      if (suppressImmediateAlert) {
        console.log("[worsening] suppress immediate item", {
          id: item.id,
          key: item.key,
        });
        continue;
      }

      deliveredWorseningAlertIdsInSession.set(item.id, deliveredAtIso);
      await presentImmediateWorseningNotification(item);
      nextState[item.id] = {
        detectedAt: item.detectedAt,
        lastDeliveredAt: deliveredAtIso,
      };
      console.log("[worsening] delivered item", {
        id: item.id,
        key: item.key,
      });
    }

    await cancelWorseningTrendNotifications();
    console.log("[worsening] cancelled existing repeating reminders");

    for (const item of items) {
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
        content: buildWorseningNotificationContent(
          item,
          WORSENING_TREND_REMINDER_TYPE,
        ),
        trigger: {
          hour: time.hour,
          minute: time.minute,
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
        },
      });
      console.log("[worsening] scheduled repeating reminder", {
        hour: time.hour,
        id: item.id,
        key: item.key,
        minute: time.minute,
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
    for (const deliveredId of [...deliveredWorseningAlertIdsInSession.keys()]) {
      if (!currentIds.has(deliveredId)) {
        deliveredWorseningAlertIdsInSession.delete(deliveredId);
      }
    }
    console.log("[worsening] saved state", nextState);

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
