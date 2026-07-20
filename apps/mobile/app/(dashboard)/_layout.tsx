import { Stack } from "expo-router";

export default function DashboardLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="care-plan" />
      <Stack.Screen name="care-plan-review" />
      <Stack.Screen name="care-plans" />
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="meds-labs" />
    </Stack>
  );
}
