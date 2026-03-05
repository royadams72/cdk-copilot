import { useEffect } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useLocalSearchParams, useRouter } from "expo-router";
import { API } from "@/constants/api";

export default function VerifyScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  // console.log("verify.tsx token::", token);

  useEffect(() => {
    (async () => {
      if (!token) return; // fallback could be router.replace('/')
      // exchange for JWT
      const res = await fetch(`${API}/api/auth/exchange`, {
        body: JSON.stringify({ token }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      if (res.ok) {
        const { jwt, refreshToken, onboardingCompleted } = await res.json();
        await SecureStore.setItemAsync("ckd_jwt", jwt);
        if (refreshToken) {
          await SecureStore.setItemAsync("ckd_refresh", refreshToken);
        }
        if (onboardingCompleted) {
          router.replace("/(dashboard)/dashboard");
        } else {
          router.replace("./onboarding/pii-form");
        }
      } else {
        router.replace("./check-email");
      }
    })();
  }, [token]);

  return (
    <View style={{ alignItems: "center", flex: 1, justifyContent: "center" }}>
      <ActivityIndicator />
    </View>
  );
}
