import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { formatApiError } from "@/lib/formatApiError";
import type { ApiResponse, DashboardData } from "@/screens/dashboard/types";

export type DashboardState = {
  data: DashboardData | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
  lastLoadedAt: string | null;
};

const initialState: DashboardState = {
  data: null,
  status: "idle",
  error: null,
  lastLoadedAt: null,
};

export const fetchDashboard = createAsyncThunk<
  DashboardData,
  void,
  { rejectValue: string }
>("dashboard/fetchDashboard", async (_, { rejectWithValue }) => {
  try {
    const res = await authFetch(`${API}/api/dashboard`, { method: "GET" });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok || !(body as ApiResponse)?.ok) {
      throw new Error(formatApiError(res.status, (body as any) ?? null));
    }
    return (body as ApiResponse).data;
  } catch (err: any) {
    return rejectWithValue(err?.message ?? "Failed to load your dashboard");
  }
});

const dashboardSlice = createSlice({
  name: "dashboard",
  initialState,
  reducers: {},
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
      })
      .addCase(fetchDashboard.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ??
          action.error.message ??
          "We couldn't refresh your dashboard.";
      });
  },
});

export default dashboardSlice.reducer;
