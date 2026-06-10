import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { authFetch } from "@/lib/authFetch";
import { loadSessionToken, refreshSessionTokenOnce } from "@/lib/authSession";
import { API } from "@/constants/api";
import { ThemedText } from "@/components/themed-text";
import { ActivityIndicator, View } from "react-native";
import { styles } from "../dashboard/styles";
import { ErrorState } from "../dashboard/Dashboard";
import { logPostAuthRouteDecision, resolvePostAuthRoute } from "@/lib/onboarding";

async function restoreUserSession() {
  const res = await authFetch(`${API}/api/users/get-user`);
  const data = await res.json().catch(() => ({ ok: false }));

  return { data, res };
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
          router.replace("/(init-app)/welcome");
          console.log("token:", token);

          return;
        }

        if (!token.jwt && token.refreshToken) {
          const refreshed = await refreshSessionTokenOnce();
          if (refreshed) {
            const retried = await restoreUserSession();

            if (retried.data?.ok) {
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
          router.replace("/(init-app)/welcome");
          return;
        }

        const { res, data } = await restoreUserSession();

        if (data.ok) {
          logPostAuthRouteDecision("bootstrap", data ?? {});
          router.replace(resolvePostAuthRoute(data ?? {}) as never);
        } else if (res.status === 401) {
          const refreshed = await refreshSessionTokenOnce();
          if (refreshed) {
            const retried = await restoreUserSession();

            if (retried.data?.ok) {
              logPostAuthRouteDecision("bootstrap:retry", retried.data ?? {});
              router.replace(resolvePostAuthRoute(retried.data ?? {}) as never);
              return;
            }

            setError(
              retried.data?.message ?? "We couldn't restore your session.",
            );
          } else {
            setError("Session expired, please sign in again.");
            router.replace("/(init-app)/welcome");
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
