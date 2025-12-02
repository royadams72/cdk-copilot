import type { RootState } from "./index";

export const selectDashboardData = (state: RootState) => state.dashboard.data;
export const selectDashboardStatus = (state: RootState) =>
  state.dashboard.status;
export const selectDashboardError = (state: RootState) =>
  state.dashboard.error;
