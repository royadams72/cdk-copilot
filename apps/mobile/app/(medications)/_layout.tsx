import { Stack } from "expo-router";

export default function DashboardLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="add-medication" />
      <Stack.Screen name="medication-history" />
      <Stack.Screen name="medication-details" />
    </Stack>
  );
}
