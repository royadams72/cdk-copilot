import type { DashboardData } from "@/screens/dashboard/types";

import { appApi } from "./appApi";
export { toQueryErrorMessage } from "./appApi";

export type DashboardScope = "today" | "all";
export type DashboardQueryData = Omit<DashboardData, "patientId">;

export type MeasurementKind = "steps" | "exercise" | "sleep" | "blood_pressure";

export type MeasurementLatest = {
  count?: number;
  diastolicMmHg?: number;
  durationMin?: number;
  exercise?: {
    caloriesKcal?: number;
    durationMin?: number;
    name?: string;
  };
  kind: MeasurementKind;
  measuredAt?: string;
  systolicMmHg?: number;
};

export const dashboardApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getDashboard: builder.query<DashboardQueryData, DashboardScope | void>({
      providesTags: (_result, _error, scope) => [
        { id: scope ?? "today", type: "Dashboard" as const },
      ],
      query: (scope) => `/api/dashboard?scope=${scope ?? "today"}`,
      transformResponse: (response: DashboardData) => {
        const { patientId: _patientId, ...safeResponse } = response;
        return safeResponse;
      },
    }),
    getLatestMeasurements: builder.query<MeasurementLatest[], void>({
      providesTags: [{ id: "latest", type: "Fitness" as const }],
      query: () => "/api/measurements/latest",
    }),
  }),
  overrideExisting: false,
});

export const { useGetDashboardQuery, useGetLatestMeasurementsQuery } =
  dashboardApi;
