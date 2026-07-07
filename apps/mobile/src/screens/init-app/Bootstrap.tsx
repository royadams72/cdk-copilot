import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { APP_ROUTES } from "@/constants/routes";
import { authFetch } from "@/lib/authFetch";
import {
  clearSessionToken,
  loadSessionToken,
  markAuthenticatedSessionReady,
  refreshSessionTokenOnce,
} from "@/lib/authSession";
import { API } from "@/constants/api";
import { ThemedText } from "@/components/themed-text";
import { syncAuthenticatedAppState } from "@/lib/pushNotifications";
import { ActivityIndicator, View } from "react-native";
import { styles } from "../dashboard/styles";
import { ErrorState } from "../dashboard/Dashboard";
import { logPostAuthRouteDecision, resolvePostAuthRoute } from "@/lib/onboarding";

async function restoreUserSession() {
  const res = await authFetch(`${API}/api/users/get-user`);
  const data = await res.json().catch(() => ({ ok: false }));

  return { data, res };
}

function hasMembershipInactiveCode(data: unknown) {
  if (!data || typeof data !== "object") {
    return false;
  }

  const candidate = data as {
    errors?: { code?: string };
    code?: string;
  };

  return (
    candidate.code === "membership_inactive" ||
    candidate.errors?.code === "membership_inactive"
  );
}

const Bootstrap = () => {
  const router = useRouter();
  const [error, setError] = useState("");
  const didRunRef = useRef(false);
  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;

    (async () => {
      try {
        const token = await loadSessionToken();

        if (!token.jwt && !token.refreshToken) {
          router.replace(APP_ROUTES.welcome);
          console.log("token:", token);

          return;
        }

        if (!token.jwt && token.refreshToken) {
          const refreshed = await refreshSessionTokenOnce();
          if (refreshed) {
            const retried = await restoreUserSession();

            if (retried.data?.ok) {
              markAuthenticatedSessionReady();
              void syncAuthenticatedAppState();
              logPostAuthRouteDecision("bootstrap:refresh-only", retried.data ?? {});
              router.replace(resolvePostAuthRoute(retried.data ?? {}) as never);
              return;
            }

            setError(
              retried.data?.message ?? "We couldn't restore your session.",
            );
            return;
          }
          setError("Session expired, please sign in again.");
          router.replace(APP_ROUTES.welcome);
          return;
        }

        const { res, data } = await restoreUserSession();

        if (data.ok) {
          markAuthenticatedSessionReady();
          void syncAuthenticatedAppState();
          logPostAuthRouteDecision("bootstrap", data ?? {});
          router.replace(resolvePostAuthRoute(data ?? {}) as never);
        } else if (res.status === 403 && hasMembershipInactiveCode(data)) {
          await clearSessionToken();
          router.replace(APP_ROUTES.accessEnded);
        } else if (res.status === 401) {
          const refreshed = await refreshSessionTokenOnce();
          if (refreshed) {
            const retried = await restoreUserSession();

            if (retried.data?.ok) {
              markAuthenticatedSessionReady();
              void syncAuthenticatedAppState();
              logPostAuthRouteDecision("bootstrap:retry", retried.data ?? {});
              router.replace(resolvePostAuthRoute(retried.data ?? {}) as never);
              return;
            }

            if (
              retried.res.status === 403 &&
              hasMembershipInactiveCode(retried.data)
            ) {
              await clearSessionToken();
              router.replace(APP_ROUTES.accessEnded);
              return;
            }

            setError(
              retried.data?.message ?? "We couldn't restore your session.",
            );
          } else {
            setError("Session expired, please sign in again.");
            router.replace(APP_ROUTES.welcome);
          }
        } else {
          setError(data?.message ?? "We couldn't restore your session.");
        }
      } catch (error: any) {
        console.log("Bootstrap", error);

        setError(error?.message ?? "We couldn't restore your session.");
      }
    })();
  }, [router]);
  // TODO: Use loader
  return (
    <>
      {!error ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" />
          <ThemedText style={styles.helperText}>
            Loading your dashboard...
          </ThemedText>
        </View>
      ) : (
        <ErrorState message={error} />
      )}
    </>
  );
};

export default Bootstrap;
