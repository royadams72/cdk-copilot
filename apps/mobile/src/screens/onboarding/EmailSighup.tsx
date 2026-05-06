// EmailSignup.tsx
import { useState } from "react";
import { Alert, Button, Text, TextInput, View } from "react-native";
import { API } from "@/constants/api";
import { getOrCreateAuthDeviceId } from "@/lib/authDevice";
export default function EmailSignup() {
  const [email, setEmail] = useState("");

  async function submit() {
    try {
      const deviceId = await getOrCreateAuthDeviceId();
      const res = await fetch(`${API}/api/patients/signup-init`, {
        body: JSON.stringify({ deviceId, email }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        Alert.alert(
          "Signup failed",
          `Status ${res.status}\n${String(data?.error ?? data?.message ?? "Unknown error").slice(0, 500)}`,
        );
        return;
      }

      Alert.alert(
        "Check your email",
        "We sent you a verification link to continue in the app.",
      );
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
        style={{ borderRadius: 8, borderWidth: 1, padding: 12 }}
      />
      <Button title="Continue" onPress={submit} />
    </View>
  );
}
