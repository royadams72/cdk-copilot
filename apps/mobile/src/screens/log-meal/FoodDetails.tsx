import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchNutritionData,
  selectAcitveGroupSummaries,
  selectActiveItem,
  selectGroupInfoById,
} from "@/store/slices/logMealSlice";
import { Button } from "@react-navigation/elements";
import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { logMealStyles } from "./styles";
import { styles } from "../nutrition/styles";
import { isAnyFieldEmpty } from "@/lib/emptyFields";
type Props = {};

export default function FoodDetails({}: Props) {
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
      // console.log("selectedFood::", selectedFood);
      dispatch(fetchNutritionData({ foodItem: selectedFood, groupInfo }));
      // console.log("groupInfo::", groupInfo);
    }
  }, [selectedFood, groupInfo, dispatch]);
  return (
    <View style={styles.container}>
      <View>
        <Text>{selectedFood && selectedFood.name}</Text>
      </View>
      <ScrollView>
        {foods &&
          foods.map((food) => (
            <Pressable style={logMealStyles.logButton} key={food.foodId}>
              <Text style={logMealStyles.logButtonText}>{food.name}</Text>
            </Pressable>
          ))}
      </ScrollView>
    </View>
  );
}
