import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Alert, Platform } from "react-native";
import type {
  PatientWorseningTrendAlert,
  PatientWorseningTrendAlertsResponse,
} from "@ckd/core";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { hasAuthenticatedSessionReady } from "@/lib/authSession";
import { logHealthConnectEvent } from "@/lib/healthConnectEventLogger";
import { secureStorage } from "@/lib/secureStorage";

const SLEEP_REMINDER_NOTIFICATION_ID_KEY = "ckd_sleep_morning_reminder_id";
const CARE_PLAN_REMINDER_TYPE = "care-plan-reminder";
const CARE_PLAN_ALERT_TYPE = "care-plan-alert";
const CARE_PLAN_COMPLETED_TYPE = "care-plan-completed";
const CARE_PLAN_REMINDER_CHANNEL_ID = "care-plan-reminders";
const CARE_PLAN_REMINDER_HOUR = 9;
const CARE_PLAN_ALERT_STATE_KEY = "ckd_care_plan_alert_state";
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

type WorseningTrendDebugResponse = {
  activeAlerts?: PatientWorseningTrendAlert[];
  checkIns?: Array<{
    alertId?: string;
    key?: string;
    responseCode?: string;
    responseLabel?: string;
    submittedAt?: string;
  }>;
  states?: Array<{
    episodeId?: string;
    firstDetectedAt?: string;
    key?: string;
    lastDetectedAt?: string;
    status?: string;
    viewedAt?: string | null;
  }>;
};

type WorseningTrendViewedArgs = {
  alertId: string;
  key: PatientWorseningTrendAlert["key"];
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

  await Promise.allSettled([
    syncPushToken(),
    syncCarePlanReminderNotifications(),
    syncSleepReminderNotification(),
    syncWorseningTrendNotifications(),
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
  const opensCheckIn =
    typeof item.screen === "string" && item.screen.startsWith("/worsening-check-in");
  Alert.alert(item.title, item.body, [
    {
      style: "cancel",
      text: "Later",
    },
    {
      onPress: () => {
        if (typeof item.screen === "string" && item.screen.startsWith("/")) {
          void markWorseningTrendViewed({
            alertId: item.id,
            key: item.key,
          });
          router.push(item.screen as never);
        }
      },
      text: opensCheckIn ? "Check in now" : "Review now",
    },
  ]);
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
    void logHealthConnectEvent({
      event: "worsening-alert-presented",
      payload: { alertId: item.id, key: item.key, mode: "direct" },
      source: "worsening-trends",
      status: "info",
      trigger: "active",
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
  void logHealthConnectEvent({
    event: "worsening-alert-presented",
    payload: { alertId: item.id, key: item.key, mode: "scheduled" },
    source: "worsening-trends",
    status: "info",
    trigger: "active",
  });
}

export async function markWorseningTrendViewed(
  args: WorseningTrendViewedArgs,
) {
  try {
    await authFetch(`${API}/api/worsening-trends/viewed`, {
      body: JSON.stringify(args),
      method: "POST",
    });
    void logHealthConnectEvent({
      event: "worsening-alert-viewed",
      payload: args,
      source: "worsening-trends",
      status: "info",
      trigger: "active",
    });
    return true;
  } catch (error) {
    console.log("markWorseningTrendViewed failed", error);
    return false;
  }
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

async function logWorseningTrendDebugSnapshot() {
  if (!__DEV__) {
    return;
  }

  try {
    const res = await authFetch(`${API}/api/worsening-trends/debug`);
    if (!res.ok) {
      console.log("[worsening][debug] request failed", { status: res.status });
      return;
    }

    const raw =
      (await res.json().catch(() => null)) as
        | ApiEnvelope<WorseningTrendDebugResponse>
        | WorseningTrendDebugResponse
        | null;
    const data = unwrapApiData<WorseningTrendDebugResponse>(raw, {});
    console.log("[worsening][debug] snapshot", {
      activeAlerts: (data.activeAlerts ?? []).map((item) => ({
        detectedAt: item.detectedAt,
        id: item.id,
        key: item.key,
        viewedAt: item.viewedAt ?? null,
      })),
      checkIns: (data.checkIns ?? []).map((item) => ({
        alertId: item.alertId,
        key: item.key,
        responseCode: item.responseCode,
        submittedAt: item.submittedAt,
      })),
      states: (data.states ?? []).map((item) => ({
        episodeId: item.episodeId,
        firstDetectedAt: item.firstDetectedAt,
        key: item.key,
        lastDetectedAt: item.lastDetectedAt,
        status: item.status,
        viewedAt: item.viewedAt ?? null,
      })),
    });
  } catch (error) {
    console.log("[worsening][debug] snapshot failed", error);
  }
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

export async function syncWorseningTrendNotifications(
  options?: SyncWorseningTrendNotificationsOptions,
) {
  try {
    if (Platform.OS !== "ios" && Platform.OS !== "android") {
      return false;
    }

    const jwt = await secureStorage.getItem("ckd_jwt");
    if (!jwt) {
      await cancelWorseningTrendNotifications();
      await secureStorage.removeItem(WORSENING_TREND_ALERT_STATE_KEY).catch(
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
    await logWorseningTrendDebugSnapshot();
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
      await secureStorage.getItem(WORSENING_TREND_ALERT_STATE_KEY),
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
        (Boolean(options?.suppressImmediateAlerts) && !item.repeatAtLocalTime) ||
        Boolean(item.viewedAt);
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
        void logHealthConnectEvent({
          event: "worsening-alert-suppressed",
          payload: {
            alertId: item.id,
            key: item.key,
            reason: item.viewedAt ? "already-viewed" : "sync-option",
          },
          source: "worsening-trends",
          status: "info",
          trigger: "active",
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
      void logHealthConnectEvent({
        event: "worsening-reminder-scheduled",
        payload: {
          alertId: item.id,
          hour: time.hour,
          key: item.key,
          minute: time.minute,
        },
        source: "worsening-trends",
        status: "info",
        trigger: "active",
      });
    }

    await secureStorage.setItem(
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
