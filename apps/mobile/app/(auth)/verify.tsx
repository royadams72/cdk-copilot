import { useEffect } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useLocalSearchParams, useRouter } from "expo-router";

const API =
  Platform.select({
    ios: "http://127.0.0.1:3000",
    android: "http://10.0.2.2:3000",
    default: "http://localhost:3000",
  }) || "http://localhost:3000";

export default function VerifyScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  // console.log("verify.tsx token::", token);

  useEffect(() => {
    (async () => {
      if (!token) return; // fallback could be router.replace('/')
      // exchange for JWT
      const res = await fetch(`${API}/api/auth/exchange`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (res.ok) {
        const { jwt } = await res.json();
        await SecureStore.setItemAsync("ckd_jwt", jwt);
        router.replace("./onboarding/pii-form");
      } else {
        router.replace("./check-email");
      }
    })();
  }, [token]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator />
    </View>
  );
}
