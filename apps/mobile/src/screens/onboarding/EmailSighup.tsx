// EmailSignup.tsx
import { useState } from "react";
import { View, TextInput, Button, Alert, Text } from "react-native";
import { API } from "@/constants/api";
export default function EmailSignup() {
  const [email, setEmail] = useState("");

  async function submit() {
    try {
      const res = await fetch(`${API}/api/patients/signup-init`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        Alert.alert("Check your email", "Tap the link to continue in the app.");
        return;
      }
      if (!res.ok) {
        Alert.alert(
          "Signup failed",
          `Status ${res.status}\n${String(data?.error ?? data?.message ?? "Unknown error").slice(0, 500)}`,
        );
        return;
      }
      Alert.alert("Check your email", "Tap the link to continue in the app.");
    } catch (e: any) {
      Alert.alert("Network error", String(e?.message || e));
    }
  }

  return (
    <View style={{ padding: 16 }}>
      <View>
        <Text>Enter your emal address</Text>
      </View>
      <TextInput
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={{ borderWidth: 1, padding: 12, borderRadius: 8 }}
      />
      <Button title="Continue" onPress={submit} />
    </View>
  );
}
