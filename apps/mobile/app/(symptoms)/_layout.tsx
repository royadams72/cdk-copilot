import { Stack } from "expo-router";

export default function SymptomsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="symptoms" />
    </Stack>
  );
}
