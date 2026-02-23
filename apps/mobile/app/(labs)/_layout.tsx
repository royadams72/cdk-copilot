import { Stack } from "expo-router";

export default function LabsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="add-labs" />
      <Stack.Screen name="labs-history" />
      <Stack.Screen name="lab-trend" />
    </Stack>
  );
}

