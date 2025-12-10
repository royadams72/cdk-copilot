import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { useState } from "react";
import { Button, TextInput, View } from "react-native";

import { formatApiError } from "@/lib/formatApiError";

export default function LogMeal() {
  const [searchTerm, setSearchTerm] = useState("");

  async function submit() {
    const res = await authFetch(
      `${API}/api/edamam?query=${encodeURIComponent(searchTerm)}`,
      { method: "GET" }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => null);

      throw new Error(formatApiError(res.status, body as any));
    }
  }
  return (
    <View>
      <TextInput
        placeholder="Search"
        autoCapitalize="none"
        keyboardType="default"
        value={searchTerm}
        onChangeText={setSearchTerm}
        style={{ borderWidth: 1, padding: 12, borderRadius: 8 }}
      />
      <Button title="Continue" onPress={submit} />
    </View>
  );
}
