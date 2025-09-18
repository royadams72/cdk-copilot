// apps/mobile/app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      {/* You can add more: <Tabs.Screen name="settings" /> */}
    </Tabs>
  );
}
