import { Stack } from "expo-router";

export default function DashboardLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="food-details" />
      <Stack.Screen name="log-meal" />
    </Stack>
  );
}
