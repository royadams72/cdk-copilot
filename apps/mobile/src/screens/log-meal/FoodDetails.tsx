import { useEffect } from "react";
import { useRouter } from "expo-router";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchNutritionData,
  selectAcitveGroupSummaries,
  selectActiveItem,
  selectGroupInfoById,
  setActiveItem,
  setMeal,
  setQuantity,
} from "@/store/slices/logMealSlice";

import { isAnyFieldEmpty } from "@/lib/emptyFields";
import { logMealStyles } from "./styles";
import { styles } from "../nutrition/styles";
import { typeStyles } from "../styles";
import { ThemedText } from "@/components/themed-text";
// type Props = {};

export default function FoodDetails() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const selectedFood = useAppSelector(selectActiveItem);
  const foods = useAppSelector(selectAcitveGroupSummaries);

  const groupInfo = useAppSelector((state) => {
    const groupId = selectedFood?.groupId;
    if (!groupId) return null;
    return selectGroupInfoById(groupId)(state);
  });

  useEffect(() => {
    //  Check active item, if some nutrition data missing dispatch an action to get it
    if (selectedFood && isAnyFieldEmpty(selectedFood?.nutrients) && groupInfo) {
      dispatch(fetchNutritionData({ foodItem: selectedFood, groupInfo }));
      // console.log("selectedFood::", selectedFood);
    }
  }, [selectedFood, groupInfo, dispatch]);

  useEffect(() => {}, []);
  const handleSetQuantity = ({
    quantity,
    groupId,
    foodId,
  }: {
    quantity: string;
    groupId: string;
    foodId: string;
  }) => {
    const nextQuantity = Number.parseFloat(quantity);
    if (Number.isNaN(nextQuantity)) return;
    dispatch(
      setQuantity({
        quantity: nextQuantity,
        groupId,
        foodId,
      }),
    );
  };

  const formatNutrientLabel = (key: string) =>
    key
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/^./, (char) => char.toUpperCase());

  return (
    <View style={styles.container}>
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
                  quantity,
                  groupId: selectedFood.groupId,
                  foodId: selectedFood.foodId,
                });
              }
            }}
            style={{ borderWidth: 1, padding: 12, borderRadius: 8 }}
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
            style={[styles.modalButton, styles.modalButtonPrimary]}
            onPress={() => {
              const { measures, groupId, ...restOfFood } = selectedFood;

              dispatch(setMeal({ food: restOfFood }));
              router.push("/(log-meal)/log-meal");
            }}
          >
            <ThemedText style={styles.modalButtonTextPrimary}>
              Add food
            </ThemedText>
          </TouchableOpacity>
        </View>
      )}
      <ScrollView>
        {foods &&
          foods.map((food) => (
            <Pressable style={logMealStyles.logButton} key={food.foodId}>
              <Text
                onPress={() =>
                  dispatch(
                    setActiveItem({
                      foodId: food.foodId,
                      groupId: food.groupId,
                    }),
                  )
                }
                style={logMealStyles.logButtonText}
              >
                {food.name}
              </Text>
            </Pressable>
          ))}
      </ScrollView>
    </View>
  );
}
