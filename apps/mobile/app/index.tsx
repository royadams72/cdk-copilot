import { View, Text, Pressable, StyleSheet } from "react-native";
import { api } from "networking";
import { useState } from "react";

export default function App() {
  const [status, setStatus] = useState("Tap to ping");

  const ping = async () => {
    try {
      const res = await api<{ status: string }>("/api/ping");
      setStatus(res.status);
    } catch (e: any) {
      setStatus("Error: " + e.message);
    }
  };

  return (
    <View style={s.container}>
      <Text>{status}</Text>
      <Pressable onPress={ping}>
        <Text>Presskkk</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
});
