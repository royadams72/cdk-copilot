import { Stack } from "expo-router";

export default function FitnessLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="fitness-details" />
    </Stack>
  );
}
