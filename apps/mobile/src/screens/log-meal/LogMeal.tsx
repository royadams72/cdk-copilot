import { useEffect, useState, useCallback, useRef } from "react";
import {
  Button,
  TextInput,
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  BackHandler,
  TouchableOpacity,
} from "react-native";

import { useRouter, useNavigation } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchMealData,
  fetchNutritionData,
  ItemSummary,
  selectFoodItems,
  selectItemsSummary,
  selectMealItemsFromFoodItems,
  removeMealItem,
  clearMealState,
  setActiveItem,
  selectMeal,
  selectActiveMealType,
  selectIsDirty,
  saveMealData,
} from "@/store/slices/logMealSlice";

import { logMealStyles } from "./styles";
import { styles } from "../nutrition/styles";
import { isAnyFieldEmpty } from "@/lib/emptyFields";
import { ThemedText } from "@/components/themed-text";

export default function LogMeal() {
  const router = useRouter();
  const navigation = useNavigation();
  const [searchTerm, setSearchTerm] = useState("");
  const [shouldLoadInitialNutrition, setShouldLoadInitialNutrition] =
    useState(false);
  const dispatch = useAppDispatch();
  const items = useAppSelector(selectItemsSummary);
  const meatlType = useAppSelector(selectActiveMealType);
  const isDirty = useAppSelector(selectIsDirty);
  const isLeavingRef = useRef(false);

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

  const confirmExit = useCallback((onLeave?: () => void) => {
    if (isLeavingRef.current) return;
    Alert.alert("Leave this screen?", "Your meal will not be saved.", [
      { text: "Stay", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: () => {
          isLeavingRef.current = true;
          dispatch(clearMealState());
          if (onLeave) {
            onLeave();
            return;
          }
          router.back();
        },
      },
    ]);
  }, [dispatch, router]);

  useFocusEffect(
    useCallback(() => {
      const onHardwareBack = () => {
        if (isLeavingRef.current) return false;
        if (!isDirty) return false;
        confirmExit(() => navigation.goBack());
        return true;
      };

      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        onHardwareBack,
      );

      const unsubscribe = navigation.addListener("beforeRemove", (e) => {
        if (isLeavingRef.current) return;
        if (!isDirty) return;
        e.preventDefault();
        confirmExit(() => navigation.dispatch(e.data.action));
      });

      return () => {
        backHandler.remove();
        unsubscribe();
      };
    }, [confirmExit, isDirty, navigation]),
  );

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
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.navRow}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.navButton}
          >
            <ThemedText style={styles.navButtonText}>‹ Back</ThemedText>
          </TouchableOpacity>
        </View>
        <ThemedText type="title">Nutrition</ThemedText>
        <ThemedText style={styles.helperText}>
          Track how your meals contribute to renal targets.
        </ThemedText>
      </View>
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
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => dispatch(saveMealData())}
            style={styles.navButton}
          >
            <ThemedText style={styles.navButtonText}>Save Meal</ThemedText>
          </TouchableOpacity>
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
