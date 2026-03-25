// app/_layout.tsx
import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { Slot, useRouter } from "expo-router";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";

import { syncPushToken } from "@/lib/pushNotifications";
import { store, persistor } from "@/store";

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    syncPushToken();

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
        <Slot />
      </PersistGate>
    </Provider>
  );
}
