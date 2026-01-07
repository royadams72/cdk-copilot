import { useState } from "react";
import { Button, TextInput, View, Text } from "react-native";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchMealData,
  ItemSummary,
  selectFirstLabelInfo,
} from "@/store/slices/logMealSlice";

export default function LogMeal() {
  const [searchTerm, setSearchTerm] = useState("");
  const dispatch = useAppDispatch();
  const items = useAppSelector(selectFirstLabelInfo);
  async function submit() {
    console.log("fired");

    dispatch(fetchMealData({ searchTerm }));
    console.log("labels::", items);
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
      {items.length > 0 && (
        <View>
          {items.map((item: ItemSummary, index: number) => (
            <Text key={index}>
              {item.label} - {item.quantity}
              {item.unit}
            </Text>
          ))}
        </View>
      )}
    </>
  );
}
