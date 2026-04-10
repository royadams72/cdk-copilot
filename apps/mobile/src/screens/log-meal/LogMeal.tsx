import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import type {
  TFoodItem,
  TFoodItemEntry,
  TNutritionFavouriteFood,
  TNutritionFavouriteMeal,
} from "@ckd/core";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { FoodCard } from "@/components/food-card";
import {
  appendFoodsToMeal,
  applyFetchMealByDate,
  applyFetchMealData,
  applyMealCandidate,
  applyNutritionResults,
  clearMealCandidate,
  clearMealState,
  ItemSummary,
  mealTypes,
  registerFoodItem,
  removeMealItem,
  selectActiveMealType,
  selectEatenAt,
  selectEditingEntryId,
  selectIsDirty,
  selectItemsSummary,
  selectMeal,
  selectMealCandidate,
  setActiveItem,
  setEatenAt,
} from "@/store/slices/logMealSlice";

import { logMealStyles } from "./styles";
import { NutritionStyles as styles } from "../nutrition/styles";
import { ThemedText } from "@/components/themed-text";
import { DateTimeModal } from "@/components/date-time-modal";
import {
  useCheckMealExistsMutation,
  useDeleteMealDataMutation,
  useFetchFavouriteItemsQuery,
  useFetchMealByDateMutation,
  useFetchNutritionDataMutation,
  useLazyFetchMealDataQuery,
  useSaveMealDataMutation,
  useUpdateMealDataMutation,
} from "@/store/services/logMealApi";
import { toQueryErrorMessage } from "@/store/services/appApi";
import { mapForSaveOrUpdate } from "./utils";

type LogMealTab = "current" | "foods" | "meals";

type FavouriteFoodView = Omit<
  TNutritionFavouriteFood,
  "patientId" | "createdAt" | "updatedAt" | "lastUsedAt"
> & {
  id: string;
  lastUsedAt: string;
  updatedAt: string;
};

type FavouriteMealView = Omit<
  TNutritionFavouriteMeal,
  "patientId" | "createdAt" | "updatedAt" | "lastUsedAt"
> & {
  id: string;
  lastUsedAt: string;
  updatedAt: string;
};

export default function LogMeal() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    day?: string | string[];
    tab?: string | string[];
  }>();
  const requestedDay = Array.isArray(params.day) ? params.day[0] : params.day;

  const navigation = useNavigation();
  const dispatch = useAppDispatch();

  const [fetchNutritionData] = useFetchNutritionDataMutation();
  const [fetchMealData] = useLazyFetchMealDataQuery();
  const [fetchMealByDate] = useFetchMealByDateMutation();
  const [checkMealExists] = useCheckMealExistsMutation();
  const [deleteMealData] = useDeleteMealDataMutation();
  const [saveMealData] = useSaveMealDataMutation();
  const [updateMealData] = useUpdateMealDataMutation();
  const { data: favouriteItems } = useFetchFavouriteItemsQuery();

  const items = useAppSelector(selectItemsSummary);
  const mealType = useAppSelector(selectActiveMealType);
  const isDirty = useAppSelector(selectIsDirty);
  const eatenAtIso = useAppSelector(selectEatenAt);
  const editingEntryId = useAppSelector(selectEditingEntryId);
  const mealCandidate = useAppSelector(selectMealCandidate);

  const meal = useAppSelector((state) => {
    if (!mealType) return [] as TFoodItem[];
    return selectMeal(mealType)(state);
  });

  const [activeTab, setActiveTab] = useState<LogMealTab>("foods");
  const [searchTerm, setSearchTerm] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [dateTime, setDateTime] = useState(() =>
    buildInitialDateTime(requestedDay, eatenAtIso),
  );
  const [showDateTimeModal, setShowDateTimeModal] = useState(false);
  const [showExistingMealModal, setShowExistingMealModal] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isPersistingMeal, setIsPersistingMeal] = useState(false);

  const isLeavingRef = useRef(false);
  const lastPromptRef = useRef<string | null>(null);
  const autoLoadKeyRef = useRef<string | null>(null);
  const allowNextNavigationRef = useRef(false);
  const requestedNutritionUidsRef = useRef(new Set<string>());
  const hasAppliedDefaultTabRef = useRef(false);
  const hasAppliedRequestedDayRef = useRef(false);
  const mealDateIso = dateTime.toISOString();

  useEffect(() => {
    const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
    if (
      requestedTab === "current" ||
      requestedTab === "foods" ||
      requestedTab === "meals"
    ) {
      setActiveTab(requestedTab);
    }
  }, [params.tab]);

  useEffect(() => {
    if (!requestedDay || editingEntryId || hasAppliedRequestedDayRef.current)
      return;
    const next = buildLogDateTimeForDay(requestedDay);
    if (Number.isNaN(next.getTime())) return;
    hasAppliedRequestedDayRef.current = true;
    setDateTime(next);
  }, [editingEntryId, requestedDay]);

  useEffect(() => {
    if (editingEntryId) {
      setActiveTab("current");
    }
  }, [editingEntryId]);

  useEffect(() => {
    const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
    if (editingEntryId) return;
    if (requestedTab) return;
    if (hasAppliedDefaultTabRef.current) return;
    hasAppliedDefaultTabRef.current = true;
    setActiveTab("foods");
  }, [editingEntryId, params.tab]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = setTimeout(() => setToastMessage(null), 2500);
    return () => clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    if (!eatenAtIso) return;
    if (requestedDay && !editingEntryId) return;
    const next = new Date(eatenAtIso);
    if (!Number.isNaN(next.getTime())) setDateTime(next);
  }, [eatenAtIso, editingEntryId, requestedDay]);

  useEffect(() => {
    if (!mealCandidate) return;
    if (editingEntryId) return;
    if (lastPromptRef.current === mealCandidate.entryId) return;
    lastPromptRef.current = mealCandidate.entryId;
    setShowExistingMealModal(true);
  }, [mealCandidate, editingEntryId]);

  useEffect(() => {
    if (!mealType) return;
    if (editingEntryId) return;
    if ((meal?.length ?? 0) > 0) return;

    const dayKey = mealDateIso.slice(0, 10);
    const autoKey = `${mealType}:${dayKey}`;
    if (autoLoadKeyRef.current === autoKey) return;

    autoLoadKeyRef.current = autoKey;
    void (async () => {
      try {
        const entry = await fetchMealByDate({
          eatenAt: mealDateIso,
          mealType,
        }).unwrap();
        dispatch(applyFetchMealByDate({ entry }));
      } catch (error) {
        console.log("fetchMealByDate failed", error);
      }
    })();
  }, [dispatch, editingEntryId, fetchMealByDate, meal, mealDateIso, mealType]);

  useEffect(() => {
    const itemsMissingNutrition = meal.filter((item) => {
      if (!item.uid || requestedNutritionUidsRef.current.has(item.uid)) {
        return false;
      }
      return hasMissingCoreNutrients(item);
    });

    if (!itemsMissingNutrition.length) return;

    itemsMissingNutrition.forEach((item) => {
      if (item.uid) requestedNutritionUidsRef.current.add(item.uid);
    });

    void (async () => {
      try {
        const results = await fetchNutritionData({
          foodItems: itemsMissingNutrition,
        }).unwrap();
        dispatch(
          applyNutritionResults({
            requestedUids: itemsMissingNutrition.map((item) => item.uid),
            results,
          }),
        );
      } catch (error) {
        console.log("fetchNutritionData failed", error);
      }
    })();
  }, [dispatch, fetchNutritionData, meal]);

  const favouriteFoods = useMemo(
    () => (favouriteItems?.foods ?? []) as FavouriteFoodView[],
    [favouriteItems?.foods],
  );
  const favouriteMeals = useMemo(
    () => (favouriteItems?.meals ?? []) as FavouriteMealView[],
    [favouriteItems?.meals],
  );

  const displayedFoods = useMemo(() => {
    return favouriteFoods.map((item) => toDraftFood(item));
  }, [favouriteFoods]);

  async function submit() {
    const nextQuery = searchTerm.trim();
    if (!nextQuery || isSearching) return;
    setIsSearching(true);
    try {
      const results = await fetchMealData({ searchTerm: nextQuery }).unwrap();
      dispatch(applyFetchMealData({ results }));
      setHasSearched(true);
      setActiveTab("current");
    } catch (error) {
      console.log("fetchMealData failed", error);
    } finally {
      setIsSearching(false);
    }
  }

  async function persistMeal() {
    if (isPersistingMeal) return;
    if (editingEntryId && !isDirty) return;
    setIsPersistingMeal(true);
    try {
      if (editingEntryId && meal && mealType) {
        const mealData = mapForSaveOrUpdate(
          mealDateIso,
          meal,
          mealType,
          editingEntryId,
        );
        await updateMealData({ mealData }).unwrap();
      } else if (meal && mealType) {
        const mealData = mapForSaveOrUpdate(mealDateIso, meal, mealType);
        await saveMealData({ mealData }).unwrap();
      }

      dispatch(clearMealState());
      isLeavingRef.current = true;
      router.push("/(nutrition)/nutrition-details");
    } catch (err: any) {
      Alert.alert(
        editingEntryId ? "Update failed" : "Save failed",
        toQueryErrorMessage(err, "Please try again."),
      );
    } finally {
      setIsPersistingMeal(false);
    }
  }

  async function deleteMeal() {
    if (isPersistingMeal || !editingEntryId) return;
    setIsPersistingMeal(true);
    try {
      await deleteMealData({ entryId: editingEntryId }).unwrap();
      isLeavingRef.current = true;
      router.replace("/(nutrition)/nutrition-details");
    } catch (err: any) {
      Alert.alert("Delete failed", err?.message ?? "Please try again.");
    } finally {
      setIsPersistingMeal(false);
    }
  }

  const confirmExit = useCallback(
    (onLeave?: () => void) => {
      if (isLeavingRef.current) return;
      Alert.alert(
        "Discard this meal?",
        "Your current meal changes will be lost.",
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
              router.replace("/(nutrition)/nutrition-details");
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

  function showAddedToast() {
    setToastMessage("This item has been added to current meal");
  }

  function openFoodDetails(food: TFoodItem) {
    dispatch(registerFoodItem({ food }));
    allowNextNavigationRef.current = true;
    dispatch(
      setActiveItem({
        foodId: food.foodId,
        groupId: food.groupId!,
        uid: food.uid,
      }),
    );
    router.push("/(log-meal)/food-details");
  }

  function addFood(food: TFoodItem) {
    dispatch(appendFoodsToMeal({ foods: [food] }));
    showAddedToast();
  }

  function removeFood(food: TFoodItem) {
    const match = meal.find((item) => sameFoodKey(item, food));
    if (!match?.groupId) return;
    dispatch(removeMealItem({ groupId: match.groupId }));
  }

  function addMealFavourite(favourite: FavouriteMealView) {
    dispatch(
      appendFoodsToMeal({
        foods: favourite.snapshot.items.map((item, index) =>
          toDraftFoodEntry(item, `${favourite.signature}:${index}`),
        ),
      }),
    );
    setActiveTab("current");
    showAddedToast();
  }

  function removeMealFavourite(favourite: FavouriteMealView) {
    const signatureSet = new Set(
      favourite.snapshot.items.map((item) => buildFoodKey(item)),
    );
    meal
      .filter((item) => signatureSet.has(buildFoodKey(item)))
      .forEach((item) => {
        if (item.groupId) {
          dispatch(removeMealItem({ groupId: item.groupId }));
        }
      });
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
  const canSubmitMeal = items.length > 0 && (!editingEntryId || isDirty);

  const currentMealTypeLabel =
    mealTypes.find((entry) => entry.value === mealType)?.label ?? "Meal";

  return (
    <View style={styles.screen}>
      <View style={logMealStyles.fixedHeader}>
        <View style={styles.navRow}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              if (isDirty) {
                confirmExit();
                return;
              }
              isLeavingRef.current = true;
              dispatch(clearMealState());
              router.replace("/(nutrition)/nutrition-details");
            }}
            style={styles.navButton}
          >
            <ThemedText style={styles.navButtonText}>‹ Back</ThemedText>
          </TouchableOpacity>
        </View>
        <ThemedText type="title">
          {editingEntryId ? "Update" : "Log"} {currentMealTypeLabel}
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
        <View style={logMealStyles.searchWrap}>
          <TextInput
            placeholder="100g roast chicken thighs with 150g white rice"
            autoCapitalize="none"
            keyboardType="default"
            value={searchTerm}
            onChangeText={(value) => {
              setSearchTerm(value);
              if (!value.trim()) {
                setHasSearched(false);
              }
            }}
            style={logMealStyles.searchInput}
          />
          <TouchableOpacity
            accessibilityRole="button"
            disabled={isSearching || searchTerm.trim().length === 0}
            onPress={submit}
            style={[
              logMealStyles.searchButton,
              (isSearching || searchTerm.trim().length === 0) &&
                logMealStyles.buttonDisabled,
            ]}
          >
            <ThemedText style={logMealStyles.searchButtonText}>
              {isSearching ? "Searching..." : "Search"}
            </ThemedText>
          </TouchableOpacity>
        </View>
        <View style={logMealStyles.tabRow}>
          {[
            { label: "Current Meal", value: "current" as const },
            { label: "Foods", value: "foods" as const },
            { label: "Meals", value: "meals" as const },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.value}
              onPress={() => setActiveTab(tab.value)}
              style={[
                logMealStyles.tabButton,
                activeTab === tab.value && logMealStyles.tabButtonActive,
              ]}
            >
              <ThemedText
                style={[
                  logMealStyles.tabButtonText,
                  activeTab === tab.value && logMealStyles.tabButtonTextActive,
                ]}
              >
                {tab.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        style={logMealStyles.contentScroll}
        contentContainerStyle={logMealStyles.contentContainer}
      >
        {activeTab === "current" ? (
          <View style={logMealStyles.section}>
            {items.length ? (
              items.map(
                (item) =>
                  item && (
                    <FoodCard
                      key={item.uid}
                      title={buildDisplayFoodName(item.name, item.brand)}
                      subtitle={buildFoodSubtitle(item)}
                      onPress={() => {
                        const currentFood = meal.find(
                          (entry) =>
                            entry.uid === item.uid &&
                            entry.groupId === item.groupId,
                        );
                        if (currentFood) openFoodDetails(currentFood);
                      }}
                      actions={[
                        {
                          label: "Remove",
                          onPress: () =>
                            dispatch(removeMealItem({ groupId: item.groupId })),
                          variant: "danger",
                        },
                      ]}
                      style={logMealStyles.listCard}
                    />
                  ),
              )
            ) : (
              <View style={logMealStyles.emptyState}>
                <ThemedText style={logMealStyles.emptyTitle}>
                  No foods in the current meal yet
                </ThemedText>
                <ThemedText style={logMealStyles.emptyText}>
                  Add items from the Foods or Meals tabs.
                </ThemedText>
              </View>
            )}
          </View>
        ) : null}

        {activeTab === "foods" ? (
          <View style={logMealStyles.section}>
            {displayedFoods.length ? (
              displayedFoods.map((food) => {
                const isAdded = meal.some((entry) => sameFoodKey(entry, food));
                return (
                  <FoodCard
                    key={`${food.groupId}:${food.uid}`}
                    title={buildDisplayFoodName(food.name, food.brand)}
                    subtitle={buildFoodSubtitle(food)}
                    description={
                      hasSearched && searchTerm.trim().length > 0
                        ? "Tap the card to edit this food before adding it."
                        : "Favourite food"
                    }
                    onPress={() => openFoodDetails(food)}
                    actions={[
                      {
                        label: isAdded ? "Remove" : "Add",
                        onPress: () =>
                          isAdded ? removeFood(food) : addFood(food),
                        variant: isAdded ? "danger" : "primary",
                      },
                    ]}
                    style={logMealStyles.listCard}
                  />
                );
              })
            ) : (
              <View style={logMealStyles.emptyState}>
                <ThemedText style={logMealStyles.emptyTitle}>
                  {hasSearched && searchTerm.trim().length > 0
                    ? "No foods found"
                    : "No favourite foods yet"}
                </ThemedText>
                <ThemedText style={logMealStyles.emptyText}>
                  {hasSearched && searchTerm.trim().length > 0
                    ? "Try a different search phrase."
                    : "Foods you log twice will appear here automatically."}
                </ThemedText>
              </View>
            )}
          </View>
        ) : null}

        {activeTab === "meals" ? (
          <View style={logMealStyles.section}>
            {favouriteMeals.length ? (
              favouriteMeals.map((favourite) => {
                const mealFoodKeys = new Set(
                  meal.map((item) => buildFoodKey(item)),
                );
                const isAdded = favourite.snapshot.items.every((item) =>
                  mealFoodKeys.has(buildFoodKey(item)),
                );

                return (
                  <FoodCard
                    key={favourite.id}
                    title={favourite.label}
                    subtitle={`${capitalize(favourite.mealType)} | Last used ${formatShortDate(favourite.lastUsedAt)}`}
                    description={favourite.snapshot.items
                      .map(
                        (item) =>
                          `${item.name} (${item.quantity} ${formatMealUnit(item.unit)})`,
                      )
                      .join(", ")}
                    actions={[
                      {
                        label: isAdded ? "Remove" : "Add",
                        onPress: () =>
                          isAdded
                            ? removeMealFavourite(favourite)
                            : addMealFavourite(favourite),
                        variant: isAdded ? "danger" : "primary",
                      },
                    ]}
                    style={logMealStyles.listCard}
                  />
                );
              })
            ) : (
              <View style={logMealStyles.emptyState}>
                <ThemedText style={logMealStyles.emptyTitle}>
                  No favourite meals yet
                </ThemedText>
                <ThemedText style={logMealStyles.emptyText}>
                  Meals you log twice will appear here automatically.
                </ThemedText>
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>

      <View style={logMealStyles.fixedFooter}>
        {editingEntryId ? (
          <>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={isPersistingMeal || !canSubmitMeal}
              onPress={persistMeal}
              style={[
                logMealStyles.footerPrimaryButton,
                (isPersistingMeal || !canSubmitMeal) &&
                  logMealStyles.buttonDisabled,
              ]}
            >
              <ThemedText style={logMealStyles.footerPrimaryButtonText}>
                {isPersistingMeal ? "Updating..." : "Update Meal"}
              </ThemedText>
            </TouchableOpacity>
            <View style={logMealStyles.footerRow}>
              <TouchableOpacity
                accessibilityRole="button"
                disabled={isPersistingMeal}
                onPress={() => {
                  Alert.alert("Delete this meal?", "This cannot be undone.", [
                    { style: "cancel", text: "Cancel" },
                    {
                      onPress: deleteMeal,
                      style: "destructive",
                      text: "Delete",
                    },
                  ]);
                }}
                style={[
                  logMealStyles.footerSecondaryButton,
                  logMealStyles.footerDangerButton,
                  isPersistingMeal && logMealStyles.buttonDisabled,
                ]}
              >
                <ThemedText
                  style={logMealStyles.footerSecondaryButtonTextLight}
                >
                  Delete Meal
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => confirmExit()}
                style={logMealStyles.footerSecondaryButton}
              >
                <ThemedText style={logMealStyles.footerSecondaryButtonText}>
                  Cancel
                </ThemedText>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={logMealStyles.footerRow}>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={isPersistingMeal || !canSubmitMeal}
              onPress={persistMeal}
              style={[
                logMealStyles.footerSecondaryButton,
                logMealStyles.footerPrimaryInlineButton,
                (isPersistingMeal || !canSubmitMeal) &&
                  logMealStyles.buttonDisabled,
              ]}
            >
              <ThemedText style={logMealStyles.footerSecondaryButtonTextLight}>
                {isPersistingMeal ? "Adding..." : "Add Meal"}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => confirmExit()}
              style={logMealStyles.footerSecondaryButton}
            >
              <ThemedText style={logMealStyles.footerSecondaryButtonText}>
                Cancel
              </ThemedText>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {toastMessage ? (
        <View pointerEvents="none" style={logMealStyles.toastWrap}>
          <View style={logMealStyles.toast}>
            <ThemedText style={logMealStyles.toastText}>
              {toastMessage}
            </ThemedText>
          </View>
        </View>
      ) : null}

      <DateTimeModal
        visible={showDateTimeModal}
        value={dateTime}
        onCancel={() => setShowDateTimeModal(false)}
        onConfirm={(next) => {
          setDateTime(next);
          dispatch(setEatenAt({ eatenAt: next.toISOString() }));
          if (mealType && !editingEntryId) {
            void (async () => {
              try {
                const candidate = await checkMealExists({
                  eatenAt: next.toISOString(),
                  mealType,
                }).unwrap();
                dispatch(applyMealCandidate({ candidate }));
              } catch (error) {
                dispatch(applyMealCandidate({ candidate: null }));
              }
            })();
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
              A {mealType ?? "meal"} already exists on this date. Add to that
              meal?
            </ThemedText>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={() => {
                  if (mealCandidate) {
                    void (async () => {
                      try {
                        const entry = await fetchMealByDate({
                          eatenAt:
                            mealCandidate.eatenAt ?? dateTime.toISOString(),
                          mealType: mealCandidate.mealType,
                        }).unwrap();
                        dispatch(applyFetchMealByDate({ entry }));
                      } catch (error) {
                        console.log("fetchMealByDate failed", error);
                      }
                    })();
                  }
                  setShowExistingMealModal(false);
                }}
              >
                <ThemedText style={styles.modalButtonTextPrimary}>
                  Add to meal
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonGhost]}
                onPress={() => {
                  dispatch(clearMealCandidate());
                  setShowExistingMealModal(false);
                }}
              >
                <ThemedText style={styles.modalButtonTextGhost}>
                  Keep separate
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function buildFoodSubtitle(item: {
  caloriesKcal?: string | number;
  carbsG?: string | number;
  phosphorusMg?: string | number;
  potassiumMg?: string | number;
  quantity: number;
  unit: string;
}) {
  return [
    `${formatMealValue(item.quantity)}${formatMealUnit(item.unit)}`,
    buildMealNutrientPart("Calories", item.caloriesKcal, "kcal"),
    buildMealNutrientPart("Carbs", item.carbsG, "g"),
    buildMealNutrientPart("Phosphorus", item.phosphorusMg, "mg"),
    buildMealNutrientPart("Potassium", item.potassiumMg, "mg"),
  ]
    .filter(Boolean)
    .join(" | ");
}

function buildDisplayFoodName(name: string, brand?: string) {
  const trimmedBrand = brand?.trim();
  if (!trimmedBrand) return name;
  if (name.toLowerCase().includes(trimmedBrand.toLowerCase())) return name;
  return `${name} (${trimmedBrand})`;
}

function capitalize(value: string | null | undefined) {
  if (!value) return "Meal";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatMealUnit(unit: string | null | undefined) {
  if (!unit) return "";
  const normalized = unit.trim().toLowerCase();
  if (["g", "gram", "grams"].includes(normalized)) return "g";
  return ` ${unit}`;
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return "recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

function formatMealValue(value: string | number | null | undefined) {
  const numberValue =
    typeof value === "number" ? value : Number.parseFloat(value ?? "");
  if (!Number.isFinite(numberValue)) return "";

  const rounded = Math.round(numberValue * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 0.0001) {
    return String(Math.round(rounded));
  }
  return rounded.toFixed(1);
}

function hasMissingCoreNutrients(item: TFoodItem) {
  const nutrients = item.nutrients ?? {};
  return (
    nutrients.caloriesKcal == null ||
    nutrients.proteinG == null ||
    isBarcodeUnknownMicronutrient(item, nutrients.phosphorusMg) ||
    isBarcodeUnknownMicronutrient(item, nutrients.potassiumMg) ||
    isBarcodeUnknownMicronutrient(item, nutrients.sodiumMg)
  );
}

function buildMealNutrientPart(
  label: string,
  value: string | number | null | undefined,
  unit: string,
) {
  const formattedValue = formatMealValue(value);
  if (!formattedValue) return "";
  return `${label} ${formattedValue}${unit}`;
}

function isBarcodeUnknownMicronutrient(
  item: TFoodItem,
  value: number | undefined,
) {
  return value == null || (item.source === "barcode" && value === 0);
}

function buildFoodKey(item: Pick<TFoodItemEntry, "foodId" | "name">) {
  return (
    item.foodId?.trim().toLowerCase() ||
    item.name.trim().toLowerCase().replace(/\s+/g, " ")
  );
}

function sameFoodKey(
  a: Pick<TFoodItemEntry, "foodId" | "name">,
  b: Pick<TFoodItemEntry, "foodId" | "name">,
) {
  return buildFoodKey(a) === buildFoodKey(b);
}

function toDraftFood(item: FavouriteFoodView): TFoodItem {
  return toDraftFoodEntry(item.snapshot, item.signature);
}

function toDraftFoodEntry(item: TFoodItemEntry, seed: string): TFoodItem {
  return {
    ...item,
    groupId: `fav:${seed}:${buildFoodKey(item)}`,
    measures: [],
  };
}

function buildLogDateTimeForDay(dayKey: string) {
  const normalizedDayKey = normalizeDayKey(dayKey);
  if (!normalizedDayKey) {
    return new Date(Number.NaN);
  }

  const [year, month, day] = normalizedDayKey
    .split("-")
    .map((value) => Number(value));
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return new Date(Number.NaN);
  }

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function buildInitialDateTime(
  requestedDay: string | undefined,
  eatenAtIso: string | null,
) {
  if (requestedDay) {
    const requestedDate = buildLogDateTimeForDay(requestedDay);
    if (!Number.isNaN(requestedDate.getTime())) {
      return requestedDate;
    }
  }

  const fallback = new Date(eatenAtIso ?? Date.now());
  return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
}

function normalizeDayKey(value: string) {
  const decodedValue = decodeURIComponent(value)
    .trim()
    .replace(/^"+|"+$/g, "");
  const matchedDayKey = decodedValue.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (matchedDayKey) {
    return matchedDayKey;
  }

  const parsed = new Date(decodedValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const day = `${parsed.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
