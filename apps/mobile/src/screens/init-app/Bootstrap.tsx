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
  return jwt;
}

const Bootstrap = () => {
  const router = useRouter();
  const [error, setError] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const token = await loadSessionToken();

        if (!token) {
          router.replace("/(init-app)/welcome");

          return;
        }

        const res = await authFetch(`${API}/api/users/get-user`);
        const data = await res.json();
        console.log("data::::::", data);

        if (data.ok) {
          router.replace("/(dashboard)/dashboard");
        } else if (data.message === '"exp" claim timestamp check failed') {
          const refreshRes = await authFetch(`${API}/api/users/refresh-token`, {
            method: "GET",
          });
          const refreshBody = await refreshRes
            .json()
            .catch(() => ({ ok: false }));
          if (refreshBody?.ok && refreshBody.data?.jwt) {
            await SecureStore.setItemAsync(
              "ckd_jwt",
              refreshBody.data.jwt as string
            );
            router.replace("/(dashboard)/dashboard");
          } else {
            setError(
              refreshBody?.message ?? "Session expired, please sign in again."
            );
            router.replace("/(init-app)/welcome");
          }
        }
      } catch (error: any) {
        console.log("don't understand", error);

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
