import { useEffect, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { authFetch } from "@/lib/authFetch";
import { API } from "@/constants/api";
import { ThemedText } from "@/components/themed-text";
import { ActivityIndicator, View } from "react-native";
import { styles } from "../dashboard/styles";
import { ErrorState } from "../dashboard/Dashboard";
async function loadSessionToken() {
  const jwt = await SecureStore.getItemAsync("ckd_jwt");
  const refreshToken = await SecureStore.getItemAsync("ckd_refresh");
  return { jwt, refreshToken };
}

async function tryRefreshSession() {
  const latestRefreshToken = await SecureStore.getItemAsync("ckd_refresh");
  if (!latestRefreshToken) {
    return { ok: false as const, message: "Session expired, please sign in again." };
  }

  const refreshRes = await fetch(`${API}/api/users/refresh-token`, {
    body: JSON.stringify({ refreshToken: latestRefreshToken }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const refreshBody = await refreshRes.json().catch(() => ({ ok: false }));

  if (refreshBody?.ok && refreshBody.data?.jwt) {
    await SecureStore.setItemAsync("ckd_jwt", refreshBody.data.jwt as string);
    if (refreshBody.data?.refreshToken) {
      await SecureStore.setItemAsync(
        "ckd_refresh",
        refreshBody.data.refreshToken as string,
      );
    }
    return { ok: true as const };
  }

  return {
    ok: false as const,
    message: refreshBody?.message ?? "Session expired, please sign in again.",
  };
}

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
          const refreshed = await tryRefreshSession();
          if (refreshed.ok) {
            const retried = await restoreUserSession();

            if (retried.data?.ok) {
              router.replace("/(dashboard)/dashboard");
              return;
            }

            setError(
              retried.data?.message ?? "We couldn't restore your session.",
            );
            return;
          }
          setError(refreshed.message);
          router.replace("/(init-app)/welcome");
          return;
        }

        const { res, data } = await restoreUserSession();

        if (data.ok) {
          router.replace("/(dashboard)/dashboard");
        } else if (res.status === 401) {
          const refreshed = await tryRefreshSession();
          if (refreshed.ok) {
            const retried = await restoreUserSession();

            if (retried.data?.ok) {
              router.replace("/(dashboard)/dashboard");
              return;
            }

            setError(
              retried.data?.message ?? "We couldn't restore your session.",
            );
          } else {
            setError(refreshed.message);
            router.replace("/(init-app)/welcome");
          }
        } else {
          setError(data?.message ?? "We couldn't restore your session.");
        }
      } catch (error: any) {
        console.log("Bootstrap", error);

        setError(error?.message ?? "We couldn't restore your session.");
      }

      // await clearSessionToken();
      // router.replace("/(init-app)/welcome");
    })();
  }, []);
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
