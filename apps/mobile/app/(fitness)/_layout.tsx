import { Stack } from "expo-router";

export default function FitnessLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="fitness-details" />
      <Stack.Screen name="metric-trend" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="missing-data" />
    </Stack>
  );
}
