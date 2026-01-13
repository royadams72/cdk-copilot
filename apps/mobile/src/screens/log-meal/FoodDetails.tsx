import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  ItemSummary,
  selectActiveGroup,
  selectActiveItemDetails,
} from "@/store/slices/logMealSlice";
import { Button } from "@react-navigation/elements";
import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { logMealStyles } from "./styles";
type Props = {};

export default function FoodDetails({}: Props) {
  const selectedFood = useAppSelector(selectActiveItemDetails);
  const foods = useAppSelector(selectActiveGroup);
  useEffect(() => {
    console.log("foods::", foods);
  }, []);
  return (
    <View style={styles.container}>
      <View>
        <Text>{selectedFood && selectedFood.label}</Text>
      </View>
      <ScrollView>
        {foods &&
          foods.map((food) => (
            <Pressable style={logMealStyles.logButton} key={food.foodId}>
              <Text style={styles.txt}>{food.label}</Text>
            </Pressable>
          ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  txt: {
    color: "#000",
  },
});
