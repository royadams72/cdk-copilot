import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { useState } from "react";
import { Button, TextInput, View, Text } from "react-native";

import { formatApiError } from "@/lib/formatApiError";
import { TEdamamFoodMeasure } from "@ckd/core";

export default function LogMeal() {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<[]>([]);

  async function submit() {
    const res = await authFetch(
      `${API}/api/edamam?query=${encodeURIComponent(searchTerm)}`,
      { method: "GET" }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => null);

      throw new Error(formatApiError(res.status, body as any));
    }
    const data = await res.json();
    console.log(data.items);

    setSearchResults(
      data.items.map((arr: any) =>
        arr.matches.map((match: any) => match.food.label)
      )
    );
  }
  return (
    <>
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
      {searchResults && (
        <View>
          {searchResults.map((label: any, index) => (
            <Text key={index}>{label}</Text>
          ))}
        </View>
      )}
    </>
  );
}
