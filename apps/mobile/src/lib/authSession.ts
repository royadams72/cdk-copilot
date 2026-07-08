import { router } from "expo-router";
import { NativeModules, Platform } from "react-native";

import { API } from "@/constants/api";
import { APP_ROUTES } from "@/constants/routes";
import { secureStorage } from "@/lib/secureStorage";

type RefreshResponse = {
  code?: string;
  data?: {
    jwt?: string;
    refreshToken?: string;
  };
  errors?: {
    code?: string;
  };
  message?: string;
  ok?: boolean;
};

let refreshPromise: Promise<boolean> | null = null;
let membershipInactiveRedirectInFlight = false;
let membershipInactiveSession = false;
let authenticatedSessionReady = false;
const MEMBERSHIP_INACTIVE_STORAGE_KEY = "ckd_membership_inactive";

type HealthConnectBackgroundSyncModuleShape = {
  cancelScheduled?: () => Promise<boolean>;
  clearAuthSession?: () => Promise<boolean>;
  syncAuthSession?: (
    jwt: string | null,
    refreshToken: string | null,
  ) => Promise<boolean>;
};

const nativeBackgroundSyncModule = NativeModules.HealthConnectBackgroundSync as
  | HealthConnectBackgroundSyncModuleShape
  | undefined;

function hasMembershipInactiveCode(data: unknown) {
  if (!data || typeof data !== "object") {
    return false;
  }

  const candidate = data as {
    code?: string;
    errors?: { code?: string };
  };

  return (
    candidate.code === "membership_inactive" ||
    candidate.errors?.code === "membership_inactive"
  );
}

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
  const jwt = await secureStorage.getItem("ckd_jwt");
  const refreshToken = await secureStorage.getItem("ckd_refresh");
  await syncNativeAuthSession(jwt, refreshToken);
}

export async function loadSessionToken() {
  const jwt = await secureStorage.getItem("ckd_jwt");
  const refreshToken = await secureStorage.getItem("ckd_refresh");
  console.log("[membership] loadSessionToken", {
    hasJwt: Boolean(jwt),
    hasRefreshToken: Boolean(refreshToken),
  });
  await syncNativeAuthSession(jwt, refreshToken);
  return { jwt, refreshToken };
}

export async function clearSessionToken() {
  console.log("[membership] clearSessionToken:start");
  authenticatedSessionReady = false;
  await secureStorage.removeItem("ckd_jwt");
  await secureStorage.removeItem("ckd_refresh");
  await nativeBackgroundSyncModule?.clearAuthSession?.();
  await nativeBackgroundSyncModule?.cancelScheduled?.();
  console.log("[membership] clearSessionToken:done");
}

export async function loadMembershipInactiveSessionState() {
  const storedValue = await secureStorage.getItem(MEMBERSHIP_INACTIVE_STORAGE_KEY);
  membershipInactiveSession = storedValue === "1";
  if (!membershipInactiveSession) {
    membershipInactiveRedirectInFlight = false;
  }
  console.log("[membership] loadMembershipInactiveSessionState", {
    membershipInactiveRedirectInFlight,
    membershipInactiveSession,
    storedValue,
  });
  return membershipInactiveSession;
}

export function hasMembershipInactiveSession() {
  return membershipInactiveSession;
}

export function resetMembershipInactiveSessionState() {
  membershipInactiveSession = false;
  membershipInactiveRedirectInFlight = false;
}

export async function clearMembershipInactiveSessionState() {
  console.log("[membership] clearMembershipInactiveSessionState:start");
  resetMembershipInactiveSessionState();
  await secureStorage.removeItem(MEMBERSHIP_INACTIVE_STORAGE_KEY);
  console.log("[membership] clearMembershipInactiveSessionState:done");
}

export function hasAuthenticatedSessionReady() {
  return authenticatedSessionReady;
}

export function markAuthenticatedSessionReady() {
  authenticatedSessionReady = true;
  membershipInactiveSession = false;
  console.log("[membership] markAuthenticatedSessionReady");
}

export async function handleMembershipInactiveSession() {
  console.log("[membership] handleMembershipInactiveSession:start", {
    membershipInactiveRedirectInFlight,
  });
  membershipInactiveSession = true;
  authenticatedSessionReady = false;
  await secureStorage.setItem(MEMBERSHIP_INACTIVE_STORAGE_KEY, "1");
  console.log("[membership] handleMembershipInactiveSession:stored-flag");
  await clearSessionToken();

  // Stop foreground sync loops immediately so the app does not keep issuing
  // Health Connect and measurement requests while the redirect is in flight.
  const [{ forceStopMeasurementSyncLoop }, { forceStopStepSyncLoop }] =
    await Promise.all([
      import("@/hooks/useSyncHealthConnectMeasurements"),
      import("@/hooks/useSyncStepCount"),
    ]);
  forceStopMeasurementSyncLoop();
  forceStopStepSyncLoop();

  // Clear cached RTK Query state so mounted screens stop retrying protected endpoints.
  const { store } = await import("@/store");
  const { appApi } = await import("@/store/services/appApi");
  store.dispatch(appApi.util.resetApiState());
  console.log("[membership] handleMembershipInactiveSession:reset-api-state");

  if (membershipInactiveRedirectInFlight) {
    console.log("[membership] handleMembershipInactiveSession:redirect-already-in-flight");
    return;
  }

  membershipInactiveRedirectInFlight = true;
  console.log("[membership] handleMembershipInactiveSession:redirecting");
  router.replace(APP_ROUTES.accessEnded);
}

export async function refreshSessionToken() {
  const refreshToken = await secureStorage.getItem("ckd_refresh");
  console.log("[membership] refreshSessionToken:start", {
    hasRefreshToken: Boolean(refreshToken),
  });
  if (!refreshToken) {
    await secureStorage.removeItem("ckd_jwt");
    console.log("[membership] refreshSessionToken:no-refresh-token");
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
  console.log("[membership] refreshSessionToken:response", {
    hasMembershipInactive: hasMembershipInactiveCode(refreshBody),
    ok: refreshBody?.ok,
    status: refreshRes.status,
  });
  if (!refreshRes.ok || !refreshBody?.ok || !nextJwt) {
    if (refreshRes.status === 403 && hasMembershipInactiveCode(refreshBody)) {
      await handleMembershipInactiveSession();
      return false;
    }
    await clearSessionToken();
    return false;
  }

  await secureStorage.setItem("ckd_jwt", nextJwt);
  const nextRefreshToken = refreshBody.data?.refreshToken?.trim();
  if (nextRefreshToken) {
    await secureStorage.setItem("ckd_refresh", nextRefreshToken);
  }
  await clearMembershipInactiveSessionState();
  markAuthenticatedSessionReady();
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
