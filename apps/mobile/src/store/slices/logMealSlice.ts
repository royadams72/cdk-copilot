import {
  createAsyncThunk,
  createSelector,
  createSlice,
  PayloadAction,
  current,
} from "@reduxjs/toolkit";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { formatApiError } from "@/lib/formatApiError";
import {
  TEdamamFoodMeasure,
  TLogMealEdamamResponse,
  TLogMealResponseItem,
} from "@ckd/core";
import { RootState } from "..";

export type ItemSummary = {
  groupId: string;
  foodId: string;
  label: string;
  quantity: number;
  unit: string;
};
export type ActiveItems = { item: TEdamamFoodMeasure; groupId: string };

export type logMealState = {
  data: TLogMealEdamamResponse | null;
  activeItems: ActiveItems[] | null;
  activeItem: { foodId: string; groupId: string } | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
  lastLoadedAt: string | null;
};

const initialState: logMealState = {
  data: null,
  activeItems: null,
  activeItem: null,
  status: "idle",
  error: null,
  lastLoadedAt: null,
};

export const fetchMealData = createAsyncThunk<
  TLogMealEdamamResponse,
  { searchTerm: string },
  { rejectValue: string }
>("logMeal/fetchMealData", async ({ searchTerm }, { rejectWithValue }) => {
  try {
    const res = await authFetch(
      `${API}/api/edamam/food-search?query=${encodeURIComponent(searchTerm)}`,
      { method: "GET" }
    );
    const body: unknown = await res.json().catch(() => null);
    const ok = !!(body as any)?.ok;
    const data = (body as any)?.data;

    if (!res.ok || !ok) {
      throw new Error(formatApiError(res.status, (body as any) ?? null));
    }
    return data as TLogMealEdamamResponse;
  } catch (err: any) {
    return rejectWithValue(err?.message ?? "Failed to load your meal data");
  }
});

export const fetchNutritionData = createAsyncThunk<
  TLogMealEdamamResponse,
  { searchTerm: string },
  { rejectValue: string }
>("logMeal/fetchNutritionData", async ({ searchTerm }, { rejectWithValue }) => {
  try {
    const res = await authFetch(
      `${API}/api/edamam?query=${encodeURIComponent(searchTerm)}`,
      { method: "GET" }
    );
    const body: unknown = await res.json().catch(() => null);
    const ok = !!(body as any)?.ok;
    const data = (body as any)?.data;

    if (!res.ok || !ok) {
      throw new Error(formatApiError(res.status, (body as any) ?? null));
    }
    return data as TLogMealEdamamResponse;
  } catch (err: any) {
    return rejectWithValue(err?.message ?? "Failed to load your meal data");
  }
});

const logMealSlice = createSlice({
  name: "logMeal",
  initialState,
  reducers: (create) => ({
    setActiveItems: create.reducer(
      (state, action: PayloadAction<{ foodId: string; groupId: string }>) => {
        const { foodId, groupId } = action.payload;

        const normalizedFoodId = String(foodId ?? "").trim();
        const normalizedgroupId = String(foodId ?? "").trim();
        // Quick sanity checks
        const items = state.data?.items ?? [];
        console.log(current(items));

        // Find the entry that contains a match for this foodId (tolerant to slightly different shapes)
        const matchedItem = items
          .find((obj) => obj.tempId === normalizedgroupId)
          ?.matches?.find(
            (m: any) =>
              String(m?.food?.foodId ?? m?.foodId ?? "").trim() ===
              normalizedFoodId
          );
        console.log("group::", current(matchedItem));

        if (!matchedItem) return;

        const activeItemsArr = state.activeItems ?? [];
        const idx = activeItemsArr.findIndex(
          (x) => x.groupId === normalizedgroupId
        );
        if (idx >= 0) {
          activeItemsArr[idx] = { item: matchedItem, groupId };
          state.activeItems = activeItemsArr;
        }
      }
    ),
    setActiveItem: create.reducer(
      (state, action: PayloadAction<{ foodId: string; groupId: string }>) => {
        const { foodId, groupId } = action.payload;
        state.activeItem = action.payload;
      }
    ),
  }),
  extraReducers: (builder) => {
    builder
      .addCase(fetchMealData.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchMealData.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.data = action.payload;
        state.error = null;
        state.lastLoadedAt = new Date().toISOString();
      })
      .addCase(fetchMealData.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ??
          action.error.message ??
          "We couldn't refresh your dashboard.";
      });
  },
});

export default logMealSlice.reducer;
export const { setActiveItems, setActiveItem } = logMealSlice.actions;

const stateData = (state: RootState) => state.logMeal.data;
const state = (state: RootState) => state.logMeal;

export const selectActiveItems = createSelector(
  (state: RootState) => state.logMeal,
  (logMeal) => logMeal.activeItems
);

export const selectActiveItem = createSelector(
  (state: RootState) => state.logMeal,
  (logMeal) => logMeal.activeItem
);

export const selectActiveItemDetails = createSelector(
  [state, selectActiveItem],
  (state) => {
    if (!state.activeItem) return;
    const { foodId, groupId } = state.activeItem;
    const entry = state.data?.items?.find((obj) => obj?.tempId === groupId);
    const matches = entry?.matches ?? [];
    const foodItem = matches.find((obj) => obj.food.foodId === foodId);
    if (!entry || !foodItem) return;

    return {
      groupId,
      foodId,
      label: foodItem.food.label,
      quantity: entry.item.quantity,
      unit: entry.item.unit ?? "",
    } satisfies ItemSummary;
  }
);

export const selectActiveGroup = createSelector(
  [state, selectActiveItem],
  (state) => {
    if (!state.activeItem) return [];
    const { foodId, groupId } = state.activeItem;
    console.log("full::", state.data?.items);

    const entry = state.data?.items?.find((obj) => obj?.tempId === groupId);
    const group = (entry?.matches ?? []).filter(
      (obj) => obj.food.foodId !== foodId
    );
    return group.map((item) => ({
      groupId,
      foodId: item.food.foodId,
      label: item.food.label,
    }));
  }
);

export const selectFirstLabelInfo = createSelector(
  stateData,
  selectActiveItems,
  (data) => {
    console.log("state", selectActiveItems);

    return Array.isArray(data?.items)
      ? data.items
          .map((entry: TLogMealResponseItem) => {
            // const label = entry.matches?.[0]?.food?.label;
            const foodItem = entry.matches?.[0]?.food;
            if (!foodItem) return null;

            return {
              groupId: entry.tempId,
              foodId: foodItem?.foodId,
              label: foodItem?.label,
              quantity: entry.item.quantity,
              unit: entry.item.unit ?? "",
            } satisfies ItemSummary;
          })
          .filter((item): item is ItemSummary => item !== null)
      : [];
  }
);
