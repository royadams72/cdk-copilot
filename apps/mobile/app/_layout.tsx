// app/_layout.tsx
import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { Slot, useRouter } from "expo-router";
import * as SystemUI from "expo-system-ui";
import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";

import {
  syncCarePlanReminderNotifications,
  syncPushToken,
  syncSleepReminderNotification,
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

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync("#FFFFFF");
    void syncNativeAuthSessionMirrorFromSecureStore();
    void syncPushToken();
    void syncCarePlanReminderNotifications();
    void syncSleepReminderNotification();
    void ensureNativeHealthConnectBackgroundSyncScheduled();

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      const screen = response?.notification.request.content.data?.screen;
      if (typeof screen === "string" && screen.startsWith("/")) {
        router.push(screen as never);
      }
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const screen = response.notification.request.content.data?.screen;
        if (typeof screen === "string" && screen.startsWith("/")) {
          router.push(screen as never);
        }
      },
    );

    return () => {
      subscription.remove();
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
