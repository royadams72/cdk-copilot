import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { formatApiError } from "@/lib/formatApiError";
import type { ApiResponse, DashboardData } from "@/screens/dashboard/types";
import { RootState } from "..";

export type DashboardScope = "today" | "all";

export type DashboardState = {
  data: DashboardData | null;
  error: string | null;
  lastLoadedAt: string | null;
  scope: DashboardScope | null;
  status: "idle" | "loading" | "succeeded" | "failed";
};

const initialState: DashboardState = {
  data: null,
  error: null,
  lastLoadedAt: null,
  scope: null,
  status: "idle",
};

export const fetchDashboard = createAsyncThunk<
  DashboardData,
  { scope?: DashboardScope } | void,
  { rejectValue: string }
>("dashboard/fetchDashboard", async (arg, { rejectWithValue }) => {
  const scope = arg?.scope ?? "today";
  try {
    const res = await authFetch(`${API}/api/dashboard?scope=${scope}`, {
      method: "GET",
    });
    const body: unknown = await res.json().catch(() => null);
    type Response = ApiResponse<DashboardData>;
    if (!res.ok || !(body as Response)?.ok) {
      throw new Error(formatApiError(res.status, (body as any) ?? null));
    }
    return (body as Response).data;
  } catch (err: any) {
    return rejectWithValue(err?.message ?? "Failed to load your dashboard");
  }
});

const dashboardSlice = createSlice({
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboard.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchDashboard.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.data = action.payload;
        state.error = null;
        state.lastLoadedAt = new Date().toISOString();
        state.scope = action.meta.arg?.scope ?? "today";
      })
      .addCase(fetchDashboard.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ??
          action.error.message ??
          "We couldn't refresh your dashboard.";
      });
  },
  initialState,
  name: "dashboard",
  reducers: {},
});

export default dashboardSlice.reducer;

export const selectDashboardData = (state: RootState) => state.dashboard.data;
export const selectRatioData = (state: RootState) =>
  state.dashboard.data?.nutrition.ratio;
export const selectDashboardStatus = (state: RootState) =>
  state.dashboard.status;
export const selectDashboardError = (state: RootState) => state.dashboard.error;
export const selectDashboardScope = (state: RootState) => state.dashboard.scope;
