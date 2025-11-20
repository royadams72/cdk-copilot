// EmailSignup.tsx
import { API } from "@/constants/api";
import { useState } from "react";
import { View, TextInput, Button, Alert } from "react-native";

export default function EmailSignup() {
  const [email, setEmail] = useState("");

  async function submit() {
    try {
      const res = await fetch(`${API}/api/patients/signup-init`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const bodyText = await res.text(); // read as text once

      if (!res.ok) {
        Alert.alert(
          "Signup failed",
          `Status ${res.status}\n${bodyText.slice(0, 500)}`
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
