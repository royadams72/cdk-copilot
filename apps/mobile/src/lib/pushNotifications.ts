import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";

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
