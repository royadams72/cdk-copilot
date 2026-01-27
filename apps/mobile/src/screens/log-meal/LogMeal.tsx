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
  selectMealItemsFromFoodItems,
  removeMealItem,
  setActiveItem,
  selectMeal,
  selectActiveMealType,
} from "@/store/slices/logMealSlice";

import { logMealStyles } from "./styles";
import { styles } from "../nutrition/styles";
import { isAnyFieldEmpty } from "@/lib/emptyFields";

export default function LogMeal() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [shouldLoadInitialNutrition, setShouldLoadInitialNutrition] =
    useState(false);
  const dispatch = useAppDispatch();
  const items = useAppSelector(selectItemsSummary);
  const meatlType = useAppSelector(selectActiveMealType);

  const meal = useAppSelector((state) => {
    if (!meatlType) return null;
    return selectMeal(meatlType)(state);
  });
  const mealItemsFromFoodItems = useAppSelector(selectMealItemsFromFoodItems);
  // const meal = useAppSelector(selectMeal);

  async function submit() {
    console.log("submitted");
    setShouldLoadInitialNutrition(true);
    dispatch(fetchMealData({ searchTerm })).then((res) => {
      console.log(meal);
    });
  }

  useEffect(() => {
    if (!shouldLoadInitialNutrition) return;
    const itemsToCheck =
      meal && meal.length > 0 ? meal : mealItemsFromFoodItems;
    if (!itemsToCheck.length) return;
    console.log("meal::", meal);
    const isAnyNurientsEmpty = itemsToCheck.some((item) =>
      isAnyFieldEmpty(item.nutrients),
    );
    console.log("isAnyNurientsEmpty:::", isAnyNurientsEmpty);
    console.log("meal", meal);

    if (isAnyNurientsEmpty) {
      dispatch(
        fetchNutritionData({
          foodItems: itemsToCheck,
        }),
      );
    }
    setShouldLoadInitialNutrition(false);
    // isAnyFieldEmpty(selectedFood?.nutrients

    // setShouldLoadInitialNutrition(false);
  }, [dispatch, meal, mealItemsFromFoodItems, shouldLoadInitialNutrition]);

  function gotoItemDetails({
    groupId,
    foodId,
    uid,
  }: {
    groupId: string;
    foodId: string;
    uid: string;
  }) {
    dispatch(setActiveItem({ foodId, groupId, uid }));
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
            <View key={item.uid} style={logMealStyles.logButton}>
              <Pressable
                onPress={() =>
                  gotoItemDetails({
                    groupId: item.groupId,
                    foodId: item.foodId,
                    uid: item.uid,
                  })
                }
              >
                <Text style={logMealStyles.logButtonText}>
                  {item.name} - {item.quantity} {item.unit}
                </Text>
              </Pressable>
              <Pressable
                style={{ backgroundColor: "red" }}
                onPress={() =>
                  dispatch(removeMealItem({ groupId: item.groupId }))
                }
              >
                <Text style={logMealStyles.logButtonText}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
