import * as SecureStore from "expo-secure-store";
import { NativeModules, Platform } from "react-native";

import { API } from "@/constants/api";

type RefreshResponse = {
  data?: {
    jwt?: string;
    refreshToken?: string;
  };
  message?: string;
  ok?: boolean;
};

let refreshPromise: Promise<boolean> | null = null;

type HealthConnectBackgroundSyncModuleShape = {
  clearAuthSession?: () => Promise<boolean>;
  syncAuthSession?: (
    jwt: string | null,
    refreshToken: string | null,
  ) => Promise<boolean>;
};

const nativeBackgroundSyncModule = NativeModules.HealthConnectBackgroundSync as
  | HealthConnectBackgroundSyncModuleShape
  | undefined;

async function syncNativeAuthSession(jwt: string | null, refreshToken: string | null) {
  if (Platform.OS !== "android" || !nativeBackgroundSyncModule?.syncAuthSession) {
    return;
  }
  await nativeBackgroundSyncModule.syncAuthSession(jwt, refreshToken);
}

export async function syncNativeAuthSessionMirror(
  jwt: string | null,
  refreshToken: string | null,
) {
  await syncNativeAuthSession(jwt, refreshToken);
}

export async function syncNativeAuthSessionMirrorFromSecureStore() {
  const jwt = await SecureStore.getItemAsync("ckd_jwt");
  const refreshToken = await SecureStore.getItemAsync("ckd_refresh");
  await syncNativeAuthSession(jwt, refreshToken);
}

export async function loadSessionToken() {
  const jwt = await SecureStore.getItemAsync("ckd_jwt");
  const refreshToken = await SecureStore.getItemAsync("ckd_refresh");
  await syncNativeAuthSession(jwt, refreshToken);
  return { jwt, refreshToken };
}

export async function clearSessionToken() {
  await SecureStore.deleteItemAsync("ckd_jwt");
  await SecureStore.deleteItemAsync("ckd_refresh");
  await nativeBackgroundSyncModule?.clearAuthSession?.();
}

export async function refreshSessionToken() {
  const refreshToken = await SecureStore.getItemAsync("ckd_refresh");
  if (!refreshToken) {
    await SecureStore.deleteItemAsync("ckd_jwt");
    return false;
  }

  const refreshRes = await fetch(`${API}/api/users/refresh-token`, {
    body: JSON.stringify({ refreshToken }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  const refreshBody = (await refreshRes
    .json()
    .catch(() => null)) as RefreshResponse | null;
  const nextJwt = refreshBody?.data?.jwt?.trim();
  if (!refreshRes.ok || !refreshBody?.ok || !nextJwt) {
    await clearSessionToken();
    return false;
  }

  await SecureStore.setItemAsync("ckd_jwt", nextJwt);
  const nextRefreshToken = refreshBody.data?.refreshToken?.trim();
  if (nextRefreshToken) {
    await SecureStore.setItemAsync("ckd_refresh", nextRefreshToken);
  }
  await syncNativeAuthSession(nextJwt, nextRefreshToken || refreshToken);

  return true;
}

export async function refreshSessionTokenOnce() {
  if (!refreshPromise) {
    refreshPromise = refreshSessionToken().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}
