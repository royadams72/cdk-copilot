import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="access-ended"
        options={{
          gestureEnabled: false,
          headerBackVisible: false,
          title: "Access no longer active",
        }}
      />
      <Stack.Screen name="check-email" />
      <Stack.Screen name="consent" />
      <Stack.Screen name="onboarding/pii-form" />
      <Stack.Screen name="onboarding/medications-form" />
      <Stack.Screen name="onboarding/labs-form" />
      <Stack.Screen name="onboarding/clinical-form" />
      <Stack.Screen name="onboarding/targets-form" />
    </Stack>
  );
}
