// app/_layout.tsx
import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { Slot, useRouter } from "expo-router";
import * as SystemUI from "expo-system-ui";
import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { AppState } from "react-native";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";

import {
  markWorseningTrendViewed,
  syncCarePlanReminderNotifications,
  syncPushToken,
  syncSleepReminderNotification,
  syncWorseningTrendNotifications,
} from "@/lib/pushNotifications";
import { syncNativeAuthSessionMirrorFromSecureStore } from "@/lib/authSession";
import { ensureNativeHealthConnectBackgroundSyncScheduled } from "@/lib/healthConnectNativeSync";
import { store, persistor } from "@/store";

const LightNavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "#FFFFFF",
    border: "#E5E7EB",
    card: "#FFFFFF",
    primary: "#8B5CF6",
    text: "#111827",
  },
};

const handledNotificationResponseIds = new Set<string>();

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    function handleNotificationResponse(
      response: Notifications.NotificationResponse | null,
    ) {
      if (!response) {
        return;
      }

      const notificationId =
        response.notification.request.identifier ||
        response.notification.date?.toString() ||
        null;

      if (notificationId) {
        if (handledNotificationResponseIds.has(notificationId)) {
          return;
        }
        handledNotificationResponseIds.add(notificationId);
      }

      const data = response.notification.request.content.data;
      const screen = data?.screen;
      if (
        typeof data?.trendId === "string" &&
        typeof data?.trendKey === "string"
      ) {
        void markWorseningTrendViewed({
          alertId: data.trendId,
          key: data.trendKey as never,
        });
      }
      if (typeof screen === "string" && screen.startsWith("/")) {
        router.replace(screen as never);
      }
      if (
        typeof data?.type === "string" &&
        (data.type.startsWith("care-plan-") ||
          data.type.startsWith("worsening-trend-"))
      ) {
        void syncCarePlanReminderNotifications();
        void syncWorseningTrendNotifications();
      }
    }

    async function syncNotificationState() {
      await Promise.allSettled([
        syncPushToken(),
        syncCarePlanReminderNotifications(),
        syncSleepReminderNotification(),
        syncWorseningTrendNotifications(),
      ]);
    }

    void SystemUI.setBackgroundColorAsync("#FFFFFF");
    void syncNativeAuthSessionMirrorFromSecureStore();
    void syncNotificationState();
    void ensureNativeHealthConnectBackgroundSyncScheduled();

    void Notifications.getLastNotificationResponseAsync().then(
      handleNotificationResponse,
    );

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse,
    );

    const receivedSubscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        const type = notification.request.content.data?.type;
        if (typeof type === "string" && type.startsWith("care-plan-")) {
          void syncCarePlanReminderNotifications();
        }
      },
    );

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void syncNotificationState();
      }
    });

    return () => {
      responseSubscription.remove();
      receivedSubscription.remove();
      appStateSubscription.remove();
    };
  }, [router]);

  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <ThemeProvider value={LightNavigationTheme}>
          <Slot />
        </ThemeProvider>
      </PersistGate>
    </Provider>
  );
}
