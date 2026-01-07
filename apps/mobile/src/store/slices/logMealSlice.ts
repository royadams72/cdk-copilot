import {
  createAsyncThunk,
  createSelector,
  createSlice,
  PayloadAction,
} from "@reduxjs/toolkit";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { formatApiError } from "@/lib/formatApiError";
import { TLogMealEdamamResponse, TLogMealResponseItem } from "@ckd/core";
import { RootState } from "..";

export type ItemSummary = {
  id: string;
  label: string;
  quantity: number;
  unit: string;
};

export type logMealState = {
  data: TLogMealEdamamResponse | null;
  activeItem: number | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
  lastLoadedAt: string | null;
};

const initialState: logMealState = {
  data: null,
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
      `${API}/api/edamam?query=${encodeURIComponent(searchTerm)}`,
      { method: "GET" }
    );
    const body: unknown = await res.json().catch(() => null);
    const ok = !!(body as any)?.ok;
    const data = (body as any)?.data;
    console.log(data);

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
    setActiveItem: create.reducer((state, action: PayloadAction<number>) => {
      state.activeItem = action.payload;
    }),
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
export const { setActiveItem } = logMealSlice.actions;

export const selectMatchesData = createSelector(
  (state: RootState) => state.logMeal.data,
  (data) =>
    Array.isArray(data?.items)
      ? data.items.flatMap((entry: TLogMealResponseItem) => entry.matches ?? [])
      : []
);

type MatchLike = { food?: { label?: string } };

export const selectAllMatchLabels = createSelector(
  selectMatchesData,
  (matches) =>
    (matches as MatchLike[])
      .map((m) => m?.food?.label)
      .filter(
        (label): label is string =>
          typeof label === "string" && label.length > 0
      )
);

export const selectFirstLabelInfo = createSelector(
  (state: RootState) => state.logMeal.data,
  (data) =>
    Array.isArray(data?.items)
      ? data.items
          .map((entry: TLogMealResponseItem) => {
            const label = entry.matches?.[0]?.food?.label;
            if (!label) return null;
            return {
              id: entry.tempId,
              label,
              quantity: entry.item.quantity,
              unit: entry.item.unit ?? "",
            } satisfies ItemSummary;
          })
          .filter((item): item is ItemSummary => item !== null)
      : []
);
// export const selectFirstLabelInfo = createSelector(
//   selectMatchesData,
//   (matches) => (matches as MatchLike[]).map((m) => m?.food?.label)
// );
// export const selectMatchLabels = (state: RootState): string[] =>
//   state.logMeal.data?.matches?.map((match: any) => match.food.label) ?? [];
