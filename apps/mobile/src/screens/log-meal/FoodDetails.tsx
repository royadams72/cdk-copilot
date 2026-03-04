import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchNutritionData,
  saveActiveItemToMeal,
  selectAcitveGroupSummaries,
  selectActiveItem,
  selectEditingEntryId,
  selectGroupInfoById,
  setActiveItem,
  setQuantity,
} from "@/store/slices/logMealSlice";

import { logMealStyles } from "./styles";
import { NutritionStyles } from "../nutrition/styles";
import { typeStyles } from "../styles";
import { ThemedText } from "@/components/themed-text";
import { FoodCard } from "@/components/food-card";
// type Props = {};

export default function FoodDetails() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const selectedFood = useAppSelector(selectActiveItem);
  const editingEntryId = useAppSelector(selectEditingEntryId);
  const foods = useAppSelector(selectAcitveGroupSummaries);
  const requestedNutritionByUidRef = useRef(new Set<string>());
  const groupInfo = useAppSelector((state) => {
    const groupId = selectedFood?.groupId;
    if (!groupId) return null;
    return selectGroupInfoById(groupId)(state);
  });

  const hasMissingCoreNutrients = (food: NonNullable<typeof selectedFood>) => {
    const nutrients = food.nutrients ?? {};
    return (
      nutrients.caloriesKcal == null ||
      nutrients.proteinG == null ||
      nutrients.phosphorusMg == null ||
      nutrients.potassiumMg == null ||
      nutrients.sodiumMg == null
    );
  };

  useEffect(() => {
    if (!selectedFood || !groupInfo || !selectedFood.uid) return;
    if (!hasMissingCoreNutrients(selectedFood)) return;
    if (requestedNutritionByUidRef.current.has(selectedFood.uid)) return;

    requestedNutritionByUidRef.current.add(selectedFood.uid);
    dispatch(fetchNutritionData({ foodItems: selectedFood }));
  }, [selectedFood, groupInfo, dispatch]);

  const handleSetQuantity = ({
    quantity,
    groupId,
    foodId,
    uid,
  }: {
    foodId: string;
    groupId: string;
    quantity: string;
    uid: string;
  }) => {
    const nextQuantity = Number.parseFloat(quantity);
    if (Number.isNaN(nextQuantity)) return;
    dispatch(
      setQuantity({
        foodId,
        groupId,
        quantity: nextQuantity,
        uid,
      }),
    );
  };

  const formatNutrientLabel = (key: string) =>
    key
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/^./, (char) => char.toUpperCase());

  return (
    <View style={NutritionStyles.container}>
      {selectedFood && (
        <View>
          <Text style={typeStyles.title}>{selectedFood.name}</Text>
          <TextInput
            placeholder="Enter amount"
            keyboardType="numeric"
            value={
              groupInfo?.quantity != null ? String(groupInfo.quantity) : ""
            }
            onChangeText={(text) => {
              const quantity = text.replace(/[^0-9.]/g, "");
              if (selectedFood?.groupId && quantity && selectedFood.foodId) {
                const nextQuantity = Number.parseFloat(quantity);
                if (Number.isNaN(nextQuantity)) return;
                handleSetQuantity({
                  foodId: selectedFood.foodId,
                  groupId: selectedFood.groupId,
                  quantity,
                  uid: selectedFood.uid,
                });
              }
            }}
            style={{ borderRadius: 8, borderWidth: 1, padding: 12 }}
          />

          <View>
            {Object.entries(selectedFood.nutrients ?? {})
              .filter(([, value]) => value !== null && value !== undefined)
              .map(([key, value]) => (
                <View key={key}>
                  <Text style={typeStyles.header}>
                    {formatNutrientLabel(key)}
                  </Text>
                  <Text style={typeStyles.copy}>
                    {parseFloat(String(value)).toFixed(2)}
                  </Text>
                </View>
              ))}
          </View>
          <TouchableOpacity
            style={[
              NutritionStyles.modalButton,
              NutritionStyles.modalButtonPrimary,
            ]}
            onPress={() => {
              dispatch(saveActiveItemToMeal());
              router.push("/(log-meal)/log-meal");
            }}
          >
            <ThemedText style={NutritionStyles.modalButtonTextPrimary}>
              {editingEntryId ? `Update food` : `Add food`}
            </ThemedText>
          </TouchableOpacity>
        </View>
      )}
      <ScrollView>
        {foods &&
          foods.map((food) => (
            <FoodCard
              key={food.uid}
              title={food.name}
              subtitle={`${food.quantity} ${food.unit}`}
              onPress={() =>
                dispatch(
                  setActiveItem({
                    foodId: food.foodId,
                    groupId: food.groupId,
                    uid: food.uid,
                  }),
                )
              }
              style={logMealStyles.listCard}
            />
          ))}
      </ScrollView>
    </View>
  );
}
