import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  Modal,
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
  checkMealExists,
  clearMealCandidate,
  clearMealState,
  deleteMealData,
  fetchMealByDate,
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
  selectMealCandidate,
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
  const mealCandidate = useAppSelector(selectMealCandidate);
  const isLeavingRef = useRef(false);
  const [dateTime, setDateTime] = useState(
    () => new Date(eatenAtIso ?? Date.now()),
  );
  const [showDateTimeModal, setShowDateTimeModal] = useState(false);
  const [showExistingMealModal, setShowExistingMealModal] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const lastPromptRef = useRef<string | null>(null);
  const autoLoadKeyRef = useRef<string | null>(null);
  const allowNextNavigationRef = useRef(false);

  useEffect(() => {
    if (!eatenAtIso) return;
    const next = new Date(eatenAtIso);
    if (!Number.isNaN(next.getTime())) setDateTime(next);
  }, [eatenAtIso]);

  useEffect(() => {
    if (!mealCandidate) return;
    if (editingEntryId) return;
    if (lastPromptRef.current === mealCandidate.entryId) return;
    lastPromptRef.current = mealCandidate.entryId;
    setShowExistingMealModal(true);
  }, [mealCandidate, editingEntryId]);

  const meal = useAppSelector((state) => {
    if (!meatlType) return null;
    return selectMeal(meatlType)(state);
  });
  const mealItemsFromFoodItems = useAppSelector(selectMealItemsFromFoodItems);
  // const meal = useAppSelector(selectMeal);

  useEffect(() => {
    if (!meatlType) return;
    if (editingEntryId) return;
    if ((meal?.length ?? 0) > 0) return;

    const todayIso = new Date().toISOString();
    const dayKey = todayIso.slice(0, 10);
    const autoKey = `${meatlType}:${dayKey}`;
    if (autoLoadKeyRef.current === autoKey) return;

    autoLoadKeyRef.current = autoKey;
    dispatch(fetchMealByDate({ eatenAt: todayIso, mealType: meatlType }));
  }, [dispatch, meal, meatlType, editingEntryId]);

  async function submit() {
    const nextQuery = searchTerm.trim();
    if (!nextQuery || isSearching) return;
    setIsSearching(true);
    setShouldLoadInitialNutrition(true);
    try {
      await dispatch(fetchMealData({ searchTerm: nextQuery })).unwrap();
    } finally {
      setIsSearching(false);
    }
  }

  const confirmExit = useCallback(
    (onLeave?: () => void) => {
      if (isLeavingRef.current) return;
      Alert.alert(
        "Leave this screen?",
        "Your meal will not be saved/updated.",
        [
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
        ],
      );
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
        if (allowNextNavigationRef.current) {
          allowNextNavigationRef.current = false;
          return;
        }
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
    allowNextNavigationRef.current = true;
    dispatch(setActiveItem({ foodId, groupId, uid }));
    router.replace("/(log-meal)/food-details");
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

  const capitalize = (value: string | null | undefined) => {
    if (!value) return "";
    return value.charAt(0).toUpperCase() + value.slice(1);
  };

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
        <ThemedText type="title">
          {editingEntryId ? `Update` : `Log`} {capitalize(meatlType)}
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
          placeholder="100g Roast chicken thighs with skin and 150g of white rice"
          autoCapitalize="none"
          keyboardType="default"
          value={searchTerm}
          onChangeText={setSearchTerm}
          style={{ borderRadius: 8, borderWidth: 1, padding: 12 }}
        />
        <TouchableOpacity
          accessibilityRole="button"
          disabled={isSearching || searchTerm.trim().length === 0}
          onPress={() => submit()}
          style={[
            styles.navButton,
            (isSearching || searchTerm.trim().length === 0) && { opacity: 0.5 },
          ]}
        >
          <ThemedText style={styles.navButtonText}>
            {isSearching ? "Searching..." : "Search"}
          </ThemedText>
        </TouchableOpacity>
      </View>
      {items && (
        <ScrollView>
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
          {items.length > 0 && (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                editingEntryId
                  ? dispatch(updateMealData())
                  : dispatch(saveMealData());
                isLeavingRef.current = true;
                router.replace("/(nutrition)/nutrition-details");
              }}
              style={styles.navButton}
            >
              <ThemedText style={styles.navButtonText}>
                {editingEntryId ? "Update Meal" : "Save Meal"}
              </ThemedText>
            </TouchableOpacity>
          )}
          {editingEntryId ? (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                Alert.alert("Delete this meal?", "This cannot be undone.", [
                  { style: "cancel", text: "Cancel" },
                  {
                    onPress: () => {
                      dispatch(deleteMealData());
                      isLeavingRef.current = true;
                      router.replace("/(nutrition)/nutrition-details");
                    },
                    style: "destructive",
                    text: "Delete",
                  },
                ]);
              }}
              style={[styles.navButton, { marginTop: 8 }]}
            >
              <ThemedText style={styles.navButtonText}>Delete Meal</ThemedText>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      )}
      <DateTimeModal
        visible={showDateTimeModal}
        value={dateTime}
        onCancel={() => setShowDateTimeModal(false)}
        onConfirm={(next) => {
          setDateTime(next);
          dispatch(setEatenAt({ eatenAt: next.toISOString() }));
          if (meatlType && !editingEntryId) {
            dispatch(
              checkMealExists({
                eatenAt: next.toISOString(),
                mealType: meatlType,
              }),
            );
          }
          setShowDateTimeModal(false);
        }}
        title="Meal date and time"
        disallowFutureDates={true}
      />
      <Modal
        transparent
        animationType="fade"
        visible={showExistingMealModal}
        onRequestClose={() => {
          setShowExistingMealModal(false);
          dispatch(clearMealCandidate());
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ThemedText type="defaultSemiBold">Meal already exists</ThemedText>
            <ThemedText style={styles.helperText}>
              A {meatlType ?? "meal"} already exists on this date. Add to that
              meal?
            </ThemedText>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={() => {
                  if (mealCandidate) {
                    dispatch(
                      fetchMealByDate({
                        eatenAt:
                          mealCandidate.eatenAt ?? dateTime.toISOString(),
                        mealType: mealCandidate.mealType,
                      }),
                    );
                  }
                  setShowExistingMealModal(false);
                }}
              >
                <ThemedText style={styles.modalButtonTextPrimary}>
                  Yes, add
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonGhost]}
                onPress={() => {
                  setShowExistingMealModal(false);
                  dispatch(clearMealCandidate());
                }}
              >
                <ThemedText style={styles.modalButtonTextGhost}>
                  No thanks
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
