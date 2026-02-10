import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { authFetch } from "@/lib/authFetch";
import { API } from "@/constants/api";
import { ThemedText } from "@/components/themed-text";
import { View, ActivityIndicator } from "react-native";
import { styles } from "../dashboard/styles";
import { ErrorState } from "../dashboard/Dashboard";
async function loadSessionToken() {
  const jwt = await SecureStore.getItemAsync("ckd_jwt");
  const refreshToken = await SecureStore.getItemAsync("ckd_refresh");
  return { jwt, refreshToken };
}

const Bootstrap = () => {
  const router = useRouter();
  const [error, setError] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const token = await loadSessionToken();

        if (!token.jwt && !token.refreshToken) {
          router.replace("/(init-app)/welcome");
          console.log("token:", token);

          return;
        }

        if (!token.jwt && token.refreshToken) {
          const refreshRes = await fetch(`${API}/api/users/refresh-token`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ refreshToken: token.refreshToken }),
          });
          const refreshBody = await refreshRes
            .json()
            .catch(() => ({ ok: false }));
          if (refreshBody?.ok && refreshBody.data?.jwt) {
            await SecureStore.setItemAsync(
              "ckd_jwt",
              refreshBody.data.jwt as string,
            );
            if (refreshBody.data?.refreshToken) {
              await SecureStore.setItemAsync(
                "ckd_refresh",
                refreshBody.data.refreshToken as string,
              );
            }
            router.replace("/(dashboard)/dashboard");
            return;
          }
          setError(
            refreshBody?.message ?? "Session expired, please sign in again.",
          );
          router.replace("/(init-app)/welcome");
          return;
        }

        const res = await authFetch(`${API}/api/users/get-user`);
        console.log("res::", res);
        const data = await res.json();

        if (data.ok) {
          router.replace("/(dashboard)/dashboard");
        } else if (data.message === '"exp" claim timestamp check failed') {
          if (!token.refreshToken) {
            setError("Session expired, please sign in again.");
            router.replace("/(init-app)/welcome");
            return;
          }
          const refreshRes = await fetch(`${API}/api/users/refresh-token`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ refreshToken: token.refreshToken }),
          });
          const refreshBody = await refreshRes
            .json()
            .catch(() => ({ ok: false }));
          if (refreshBody?.ok && refreshBody.data?.jwt) {
            await SecureStore.setItemAsync(
              "ckd_jwt",
              refreshBody.data.jwt as string,
            );
            if (refreshBody.data?.refreshToken) {
              await SecureStore.setItemAsync(
                "ckd_refresh",
                refreshBody.data.refreshToken as string,
              );
            }
            router.replace("/(dashboard)/dashboard");
          } else {
            setError(
              refreshBody?.message ?? "Session expired, please sign in again.",
            );
            router.replace("/(init-app)/welcome");
          }
        }
      } catch (error: any) {
        console.log("Bootstrap", error);

        setError("not loaded");
      }

      // await clearSessionToken();
      // router.replace("/(init-app)/welcome");
    })();
  }, [error]);
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
