// app/_layout.tsx
import { useEffect, useMemo, useState } from "react";
import * as Notifications from "expo-notifications";
import { Slot, useRouter, useSegments } from "expo-router";
import * as SystemUI from "expo-system-ui";
import { DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { AppState } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";

import {
  syncAuthenticatedAppState,
  syncCarePlanReminderNotifications,
} from "@/lib/pushNotifications";
import {
  hasAuthenticatedSessionReady,
  loadMembershipInactiveSessionState,
  syncNativeAuthSessionMirrorFromSecureStore,
} from "@/lib/authSession";
import { APP_ROUTES } from "@/constants/routes";
import { store, persistor } from "@/store";
import { theme } from "@/constants/theme";

const LightNavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: theme.colors.background,
    border: theme.colors.border,
    card: theme.colors.surface,
    primary: theme.colors.primary,
    text: theme.colors.text,
  },
};

const handledNotificationResponseIds = new Set<string>();
const PUBLIC_ROUTE_GROUPS = new Set(["(auth)", "(init-app)"]);

function isProtectedRouteSegments(segments: string[]) {
  if (segments.length === 0) {
    return false;
  }

  const [firstSegment] = segments;
  if (!firstSegment) {
    return false;
  }

  return !PUBLIC_ROUTE_GROUPS.has(firstSegment);
}

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [membershipGuardReady, setMembershipGuardReady] = useState(false);
  const [membershipInactiveLocked, setMembershipInactiveLocked] = useState(false);
  const isProtectedRoute = useMemo(
    () => isProtectedRouteSegments(segments),
    [segments],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const inactive = await loadMembershipInactiveSessionState();
      if (cancelled) {
        return;
      }

      setMembershipInactiveLocked(inactive);
      setMembershipGuardReady(true);

      if (inactive && isProtectedRoute) {
        router.replace(APP_ROUTES.accessEnded);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isProtectedRoute, router, segments]);

  useEffect(() => {
    if (!membershipGuardReady || membershipInactiveLocked) {
      return;
    }

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
      if (typeof screen === "string" && screen.startsWith("/")) {
        router.replace(screen as never);
      }
      if (
        typeof data?.type === "string" &&
        data.type.startsWith("care-plan-")
      ) {
        void syncCarePlanReminderNotifications();
      }
    }

    void SystemUI.setBackgroundColorAsync("#FFFFFF");
    void syncNativeAuthSessionMirrorFromSecureStore();
    if (hasAuthenticatedSessionReady()) {
      void syncAuthenticatedAppState();
    }

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
        void syncAuthenticatedAppState();
      }
    });

    return () => {
      responseSubscription.remove();
      receivedSubscription.remove();
      appStateSubscription.remove();
    };
  }, [membershipGuardReady, membershipInactiveLocked, router]);

  if (!membershipGuardReady) {
    return null;
  }

  const shouldBlockProtectedRoute = isProtectedRoute && membershipInactiveLocked;

  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <ThemeProvider value={LightNavigationTheme}>
          <StatusBar style="dark" backgroundColor={theme.colors.background} />
          {shouldBlockProtectedRoute ? null : <Slot />}
        </ThemeProvider>
      </PersistGate>
    </Provider>
  );
}
