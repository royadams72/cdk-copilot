import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  Button,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useNavigation, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  clearMealState,
  fetchMealData,
  fetchNutritionData,
  ItemSummary,
  removeMealItem,
  saveMealData,
  selectActiveMealType,
  selectEatenAt,
  selectEditingEntryId,
  selectFoodItems,
  selectIsDirty,
  selectItemsSummary,
  selectMeal,
  selectMealItemsFromFoodItems,
  setActiveItem,
  setEatenAt,
  updateMealData,
} from "@/store/slices/logMealSlice";

import { logMealStyles } from "./styles";
import { styles } from "../nutrition/styles";
import { isAnyFieldEmpty } from "@/lib/emptyFields";
import { ThemedText } from "@/components/themed-text";
import { DateTimeModal } from "@/components/date-time-modal";

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
  const eatenAtIso = useAppSelector(selectEatenAt);
  const editingEntryId = useAppSelector(selectEditingEntryId);
  const isLeavingRef = useRef(false);
  const [dateTime, setDateTime] = useState(
    () => new Date(eatenAtIso ?? Date.now()),
  );
  const [showDateTimeModal, setShowDateTimeModal] = useState(false);
  useEffect(() => {
    if (!eatenAtIso) return;
    const next = new Date(eatenAtIso);
    if (!Number.isNaN(next.getTime())) setDateTime(next);
  }, [eatenAtIso]);

  const meal = useAppSelector((state) => {
    if (!meatlType) return null;
    return selectMeal(meatlType)(state);
  });
  const mealItemsFromFoodItems = useAppSelector(selectMealItemsFromFoodItems);
  // const meal = useAppSelector(selectMeal);

  async function submit() {
    console.log("submitted");
    setShouldLoadInitialNutrition(true);
    dispatch(fetchMealData({ searchTerm })).then((res) => {});
  }

  const confirmExit = useCallback(
    (onLeave?: () => void) => {
      if (isLeavingRef.current) return;
      Alert.alert("Leave this screen?", "Your meal will not be saved.", [
        { style: "cancel", text: "Stay" },
        {
          onPress: () => {
            isLeavingRef.current = true;
            dispatch(clearMealState());
            if (onLeave) {
              onLeave();
              return;
            }
            router.back();
          },
          style: "destructive",
          text: "Leave",
        },
      ]);
    },
    [dispatch, router],
  );

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
    const isAnyNurientsEmpty = itemsToCheck.some((item) =>
      isAnyFieldEmpty(item.nutrients),
    );

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
    foodId: string;
    groupId: string;
    uid: string;
  }) {
    dispatch(setActiveItem({ foodId, groupId, uid }));
    router.push("/(log-meal)/food-details");
  }

  const isToday = (value: Date) => {
    const now = new Date();
    return (
      value.getFullYear() === now.getFullYear() &&
      value.getMonth() === now.getMonth() &&
      value.getDate() === now.getDate()
    );
  };

  const formattedDate = dateTime.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const formattedTime = dateTime.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  });
  const dateLabel = isToday(dateTime) ? "Today" : "Selected";
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
        <View style={logMealStyles.dateRow}>
          <ThemedText style={logMealStyles.dateText}>
            {dateLabel}: {formattedDate} {formattedTime}
          </ThemedText>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setShowDateTimeModal(true)}
            style={logMealStyles.dateButton}
          >
            <ThemedText style={logMealStyles.dateButtonText}>Change</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
      <View>
        <TextInput
          placeholder="Search"
          autoCapitalize="none"
          keyboardType="default"
          value={searchTerm}
          onChangeText={setSearchTerm}
          style={{ borderRadius: 8, borderWidth: 1, padding: 12 }}
        />
        <Button title="Continue" onPress={submit} />
      </View>
      {items && (
        <ScrollView>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() =>
              editingEntryId
                ? dispatch(updateMealData())
                : dispatch(saveMealData())
            }
            style={styles.navButton}
          >
            <ThemedText style={styles.navButtonText}>
              {editingEntryId ? "Update Meal" : "Save Meal"}
            </ThemedText>
          </TouchableOpacity>
          {items.map((item: ItemSummary) => (
            <View key={item.uid} style={logMealStyles.logButton}>
              <Pressable
                onPress={() =>
                  gotoItemDetails({
                    foodId: item.foodId,
                    groupId: item.groupId,
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
      <DateTimeModal
        visible={showDateTimeModal}
        value={dateTime}
        onCancel={() => setShowDateTimeModal(false)}
        onConfirm={(next) => {
          setDateTime(next);
          dispatch(setEatenAt({ eatenAt: next.toISOString() }));
          setShowDateTimeModal(false);
        }}
        title="Meal date and time"
        disallowFutureDates={true}
      />
    </View>
  );
}
