import { useEffect, useState } from "react";
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
  fetchNutritionData,
  ItemSummary,
  selectFoodItems,
  selectItemsSummary,
  setActiveItem,
  selectActiveItems,
} from "@/store/slices/logMealSlice";

import { logMealStyles } from "./styles";
import { styles } from "../nutrition/styles";

export default function LogMeal() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [shouldLoadInitialNutrition, setShouldLoadInitialNutrition] =
    useState(false);
  const dispatch = useAppDispatch();
  const items = useAppSelector(selectItemsSummary);
  const activeItems = useAppSelector(selectActiveItems);
  async function submit() {
    console.log("submitted");
    setShouldLoadInitialNutrition(true);
    dispatch(fetchMealData({ searchTerm }));
  }
  useEffect(() => {
    // if (!shouldLoadInitialNutrition) return;
    if (!activeItems) return;
    dispatch(
      fetchNutritionData({
        foodItems: activeItems,
      }),
    );
    setShouldLoadInitialNutrition(false);
  }, [dispatch, activeItems, shouldLoadInitialNutrition]);
  function gotoItemDetails({
    groupId,
    foodId,
  }: {
    groupId: string;
    foodId: string;
  }) {
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
          {items.map((item: ItemSummary, index) => (
            <Pressable
              key={index}
              style={logMealStyles.logButton}
              onPress={() =>
                gotoItemDetails({ groupId: item.groupId, foodId: item.foodId })
              }
            >
              <Text style={logMealStyles.logButtonText}>
                {item.name} - {item.quantity} {item.unit}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
