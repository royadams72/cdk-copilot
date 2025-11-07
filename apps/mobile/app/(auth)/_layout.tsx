import { Platform } from "react-native";
import { Stack, useRouter } from "expo-router";

const API =
  Platform.select({
    ios: "http://127.0.0.1:3000",
    android: "http://10.0.2.2:3000",
    default: "http://localhost:3000",
  }) || "http://localhost:3000";

export default function RootLayout() {
  const router = useRouter();

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
