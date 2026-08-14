import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  Modal,
  ScrollView,
  View,
} from "react-native";

import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import type {
  TFoodItem,
  TFoodItemEntry,
  TNutritionFavouriteFood,
} from "@ckd/core";

import { APP_ROUTES } from "@/constants/routes";
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
import { AppScreen } from "@/components/app-screen";
import { AppButton } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-field";
import { hasMissingCoreNutrients, mapForSaveOrUpdate } from "./utils";
import {
  buildNutritionRequestKey,
  filterUnreservedNutritionKeys,
  releaseRecentNutritionRequests,
  reserveRecentNutritionRequests,
} from "./nutritionRequestRegistry";

type LogMealTab = "current" | "foods";

type FavouriteFoodView = Omit<
  TNutritionFavouriteFood,
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
  const [searchError, setSearchError] = useState("");
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
      requestedTab === "foods"
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

    const requestableItems = filterUnreservedNutritionKeys(
      itemsMissingNutrition,
      (item) =>
        item.uid
          ? buildNutritionRequestKey(item.uid, item.quantity, item.unit)
          : null,
    );

    if (!requestableItems.length) return;

    requestableItems.forEach((item) => {
      if (item.uid) requestedNutritionUidsRef.current.add(item.uid);
    });
    const requestKeys = requestableItems
      .map((item) =>
        item.uid
          ? buildNutritionRequestKey(item.uid, item.quantity, item.unit)
          : null,
      )
      .filter((key): key is string => Boolean(key));
    reserveRecentNutritionRequests(requestKeys);

    void (async () => {
      try {
        const results = await fetchNutritionData({
          foodItems: requestableItems,
        }).unwrap();
        dispatch(
          applyNutritionResults({
            requestedUids: requestableItems.map((item) => item.uid),
            results,
          }),
        );
      } catch (error) {
        releaseRecentNutritionRequests(requestKeys);
        console.log("fetchNutritionData failed", error);
      }
    })();
  }, [dispatch, fetchNutritionData, meal]);

  const favouriteFoods = useMemo(
    () => (favouriteItems?.foods ?? []) as FavouriteFoodView[],
    [favouriteItems?.foods],
  );

  const displayedFoods = useMemo(() => {
    return favouriteFoods.map((item) => toDraftFood(item));
  }, [favouriteFoods]);

  async function submit() {
    const nextQuery = searchTerm.trim();
    if (!nextQuery || isSearching) return;
    setIsSearching(true);
    setSearchError("");
    try {
      const results = await fetchMealData({ searchTerm: nextQuery }).unwrap();
      dispatch(applyFetchMealData({ results }));
      setHasSearched(true);
      setActiveTab("current");
    } catch (error) {
      console.log("fetchMealData failed", error);
      setSearchError(
        toQueryErrorMessage(
          error,
          "We couldn't search for that food right now. Please try again.",
        ),
      );
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
      router.push(APP_ROUTES.nutritionDetails);
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
      router.replace(APP_ROUTES.nutritionDetails);
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
              router.replace(APP_ROUTES.nutritionDetails);
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
    router.push(
      `/(log-meal)/food-details?day=${encodeURIComponent(formatDayKey(dateTime))}`,
    );
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
    <AppScreen keyboardAware scroll={false}>
      <View style={logMealStyles.fixedHeader}>
        <View style={styles.navRow}>
          <AppButton
            label="Back"
            size="compact"
            variant="secondary"
            onPress={() => {
              if (isDirty) {
                confirmExit();
                return;
              }
              isLeavingRef.current = true;
              dispatch(clearMealState());
              router.replace(APP_ROUTES.nutritionDetails);
            }}
          />
        </View>
        <ThemedText type="title">
          {editingEntryId ? "Update" : "Log"} {currentMealTypeLabel}
        </ThemedText>
        <View style={logMealStyles.dateRow}>
          <ThemedText style={logMealStyles.dateText}>
            {dateLabel}: {formattedDate} {formattedTime}
          </ThemedText>
          <AppButton
            label="Change"
            onPress={() => setShowDateTimeModal(true)}
            size="compact"
            variant="outline"
          />
        </View>
        <View style={logMealStyles.searchPanel}>
          <View style={logMealStyles.searchWrap}>
            <TextField
              label="Search food"
              hideLabel
              containerStyle={logMealStyles.searchField}
              placeholder="100g of carrots"
              autoCapitalize="none"
              keyboardType="default"
              value={searchTerm}
              onChangeText={(value) => {
                setSearchTerm(value);
                if (searchError) setSearchError("");
                if (!value.trim()) setHasSearched(false);
              }}
              style={logMealStyles.searchInput}
            />
            <AppButton
              label={isSearching ? "Searching..." : "Search"}
              disabled={isSearching || searchTerm.trim().length === 0}
              loading={isSearching}
              onPress={submit}
              size="standard"
              variant="secondary"
            />
          </View>
          {searchError ? (
            <View style={logMealStyles.searchErrorBanner}>
              <ThemedText style={logMealStyles.searchErrorText}>{searchError}</ThemedText>
            </View>
          ) : null}
          <View style={logMealStyles.tabRow}>
            {[
              { label: "Current Meal", value: "current" as const },
              { label: "Saved Foods", value: "foods" as const },
            ].map((tab) => (
              <AppButton
                key={tab.value}
                label={tab.label}
                onPress={() => setActiveTab(tab.value)}
                size="compact"
                variant={activeTab === tab.value ? "success" : "outline"}
              />
            ))}
          </View>
        </View>
        <View style={logMealStyles.infoPanel}>
          <ThemedText style={logMealStyles.helperText}>
            Search one food at a time with an amount, like &quot;100g of
            carrots&quot; or &quot;50g of rice&quot;.
          </ThemedText>
        </View>
      </View>

      <View style={logMealStyles.listPanel}>
        <ThemedText style={logMealStyles.listPanelTitle}>
          {activeTab === "current" ? "Current meal" : "Saved foods"}
        </ThemedText>
        <ScrollView
          nestedScrollEnabled
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
                      actions={[
                        {
                          label: "Edit",
                          onPress: () => {
                            const currentFood = meal.find(
                              (entry) =>
                                entry.uid === item.uid &&
                                entry.groupId === item.groupId,
                            );
                            if (currentFood) openFoodDetails(currentFood);
                          },
                          variant: "ghost",
                        },
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
                  Add items from Saved Foods or search for something new.
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
                    ? 'Try a simple single-food search like "100g of carrots", then add the next item separately.'
                    : "Foods you log twice will appear here automatically."}
                </ThemedText>
              </View>
            )}
          </View>
        ) : null}

        </ScrollView>
      </View>

      <View style={logMealStyles.fixedFooter}>
        {editingEntryId ? (
          <>
            <AppButton
              label={isPersistingMeal ? "Updating..." : "Update Meal"}
              disabled={isPersistingMeal || !canSubmitMeal}
              loading={isPersistingMeal}
              fullWidth
              onPress={persistMeal}
            />
            <View style={logMealStyles.footerRow}>
              <View style={logMealStyles.footerButtonCell}>
                <AppButton label="Delete Meal" disabled={isPersistingMeal} fullWidth variant="danger" onPress={() => {
                    Alert.alert("Delete this meal?", "This cannot be undone.", [
                      { style: "cancel", text: "Cancel" },
                      { onPress: deleteMeal, style: "destructive", text: "Delete" },
                    ]);
                  }} />
              </View>
              <View style={logMealStyles.footerButtonCell}>
                <AppButton label="Cancel" fullWidth variant="secondary" onPress={() => confirmExit()} />
              </View>
            </View>
          </>
        ) : (
          <View style={logMealStyles.footerRow}>
            <View style={logMealStyles.footerButtonCell}>
              <AppButton label={isPersistingMeal ? "Adding..." : "Add Meal"} disabled={isPersistingMeal || !canSubmitMeal} loading={isPersistingMeal} fullWidth onPress={persistMeal} />
            </View>
            <View style={logMealStyles.footerButtonCell}>
              <AppButton label="Cancel" fullWidth variant="secondary" onPress={() => confirmExit()} />
            </View>
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
              } catch {
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
              <AppButton
                label="Add to meal"
                fullWidth
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
              />
              <AppButton
                label="Keep separate"
                fullWidth
                variant="secondary"
                onPress={() => {
                  dispatch(clearMealCandidate());
                  setShowExistingMealModal(false);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </AppScreen>
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

function formatMealUnit(unit: string | null | undefined) {
  if (!unit) return "";
  const normalized = unit.trim().toLowerCase();
  if (["g", "gram", "grams"].includes(normalized)) return "g";
  return ` ${unit}`;
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

function buildMealNutrientPart(
  label: string,
  value: string | number | null | undefined,
  unit: string,
) {
  const formattedValue = formatMealValue(value);
  if (!formattedValue) return "";
  return `${label} ${formattedValue}${unit}`;
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

function formatDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
