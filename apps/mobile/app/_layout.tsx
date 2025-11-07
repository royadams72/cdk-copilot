import React, { useEffect } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import { Stack, useRouter } from "expo-router";

const API =
  Platform.select({
    ios: "http://127.0.0.1:3000",
    android: "http://10.0.2.2:3000",
    default: "http://localhost:3000",
  }) || "http://localhost:3000";

export default function RootLayout() {
  const router = useRouter();

  // const handleUrl = async (url: string) => {
  //   const { queryParams } = Linking.parse(url);
  //   const code = (queryParams?.code as string) || "";
  //   if (!code) return;

  //   const res = await fetch(`${API}/api/auth/exchange`, {
  //     method: "POST",
  //     headers: { "content-type": "application/json" },
  //     body: JSON.stringify({ code }),
  //   });
  //   const json = await res.json();
  //   if (res.ok && json.jwt) {
  //     await SecureStore.setItemAsync("ckd_jwt", json.jwt);
  //     router.replace("./onboarding/profile"); // next screen
  //   }
  // };

  // useEffect(() => {
  //   const sub = Linking.addEventListener("url", ({ url }) => handleUrl(url));
  //   (async () => {
  //     const initial = await Linking.getInitialURL();
  //     if (initial) await handleUrl(initial);
  //   })();
  //   return () => sub.remove();
  // }, []);

  return (
    <Stack initialRouteName="index">
      <Stack.Screen name="index" options={{ title: "Create account" }} />
      <Stack.Screen
        name="check-email"
        options={{ title: "Check your email" }}
      />
      <Stack.Screen
        name="onboarding/profile"
        options={{ title: "Your profile" }}
      />
    </Stack>
  );
}
