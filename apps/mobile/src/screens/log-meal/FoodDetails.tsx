import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  ItemSummary,
  selectAcitveGroupSummaries,
  selectActiveItem,
} from "@/store/slices/logMealSlice";
import { Button } from "@react-navigation/elements";
import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { logMealStyles } from "./styles";
import { styles } from "../nutrition/styles";
type Props = {};

export default function FoodDetails({}: Props) {
  const selectedFood = useAppSelector(selectActiveItem);
  const foods = useAppSelector(selectAcitveGroupSummaries);
  useEffect(() => {
    //  Check active item, if some nutrition data missing dispatch an action to get it
    console.log("foods::", foods);
  }, []);
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
