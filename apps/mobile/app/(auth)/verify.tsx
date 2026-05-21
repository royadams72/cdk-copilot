import { useEffect } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useLocalSearchParams, useRouter } from "expo-router";
import { API } from "@/constants/api";
import { syncNativeAuthSessionMirror } from "@/lib/authSession";
import { ONBOARDING_ROUTES } from "@/lib/onboarding";
import { getOrCreateAuthDeviceId } from "@/lib/authDevice";

export default function VerifyScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  // console.log("verify.tsx token::", token);

  useEffect(() => {
    (async () => {
      if (!token) return; // fallback could be router.replace('/')
      // exchange for JWT
      const deviceId = await getOrCreateAuthDeviceId();
      const res = await fetch(`${API}/api/auth/exchange`, {
        body: JSON.stringify({ deviceId, token }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      if (res.ok) {
        const { jwt, refreshToken, nextOnboardingRoute, onboardingCompleted } =
          await res.json();
        await SecureStore.setItemAsync("ckd_jwt", jwt);
        if (refreshToken) {
          await SecureStore.setItemAsync("ckd_refresh", refreshToken);
        }
        await syncNativeAuthSessionMirror(jwt, refreshToken ?? null);
        if (onboardingCompleted) {
          router.replace(ONBOARDING_ROUTES.dashboard);
        } else {
          router.replace(nextOnboardingRoute ?? ONBOARDING_ROUTES.pii);
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
