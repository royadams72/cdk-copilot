import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { completeAuthExchange } from "@/lib/completeAuthExchange";
import { logPostAuthRouteDecision, resolvePostAuthRoute } from "@/lib/onboarding";

export default function VerifyScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  // console.log("verify.tsx token::", token);

  useEffect(() => {
    (async () => {
      if (!token) return; // fallback could be router.replace('/')
      try {
        const data = await completeAuthExchange(token);
        logPostAuthRouteDecision("verify", data);
        router.replace(resolvePostAuthRoute(data) as never);
      } catch {
        router.replace("./check-email");
      }
    })();
  }, [router, token]);

  return (
    <View style={{ alignItems: "center", flex: 1, justifyContent: "center" }}>
      <ActivityIndicator />
    </View>
  );
}
