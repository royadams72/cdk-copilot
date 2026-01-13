import { useState } from "react";
import {
  Button,
  TextInput,
  View,
  Text,
  ScrollView,
  Pressable,
} from "react-native";

import { useRouter } from "expo-router";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchMealData,
  ItemSummary,
  selectActiveItems,
  selectFirstLabelInfo,
  setActiveItem,
} from "@/store/slices/logMealSlice";

import { logMealStyles } from "./styles";
import { styles } from "../nutrition/styles";

export default function LogMeal() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const dispatch = useAppDispatch();
  const items = useAppSelector(selectFirstLabelInfo);
  const itemsArr = useAppSelector(selectActiveItems);
  async function submit() {
    console.log("submitted");

    dispatch(fetchMealData({ searchTerm }));
  }

  function gotoItemDetails({
    groupId,
    foodId,
  }: {
    groupId: string;
    foodId: string;
  }) {
    console.log("itemsArr", itemsArr);
    dispatch(setActiveItem({ foodId, groupId }));
    router.push("/(log-meal)/food-details");
  }
  return (
    <View style={styles.container}>
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
      {items && (
        <ScrollView>
          {items.map((item: ItemSummary) => (
            <Pressable
              key={item.groupId}
              style={logMealStyles.logButton}
              onPress={() =>
                gotoItemDetails({ groupId: item.groupId, foodId: item.foodId })
              }
            >
              <Text style={logMealStyles.logButtonText}>
                {item.label} - {item.quantity} {item.unit}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
