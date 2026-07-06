import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack initialRouteName="onboarding/pii-form">
      <Stack.Screen
        name="access-ended"
        options={{ title: "Access no longer active" }}
      />
      <Stack.Screen
        name="check-email"
        options={{ title: "Check your email" }}
      />
      <Stack.Screen name="consent" options={{ title: "Consent required" }} />
      <Stack.Screen
        name="onboarding/pii-form"
        options={{ title: "Your information" }}
      />
      <Stack.Screen
        name="onboarding/medications-form"
        options={{ title: "Your Medications" }}
      />
      <Stack.Screen
        name="onboarding/labs-form"
        options={{ title: "Your Lab Results" }}
      />
      <Stack.Screen
        name="onboarding/clinical-form"
        options={{ title: "Your Clinical Information" }}
      />
    </Stack>
  );
}
