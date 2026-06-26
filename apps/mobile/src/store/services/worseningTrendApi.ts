import type {
  PatientWorseningTrendAlertsResponse,
  PatientWorseningTrendCheckIn,
  PatientWorseningTrendCheckInRequest,
  PatientWorseningTrendViewedRequest,
} from "@ckd/core";

import { appApi } from "./appApi";

export const worseningTrendApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getActiveWorseningTrends: builder.query<
      PatientWorseningTrendAlertsResponse["items"],
      void
    >({
      providesTags: [{ id: "active", type: "Engagement" as const }],
      query: () => "/api/worsening-trends/active",
      transformResponse: (response: PatientWorseningTrendAlertsResponse) =>
        response?.items ?? [],
    }),
    submitWorseningTrendCheckIn: builder.mutation<
      PatientWorseningTrendCheckIn,
      PatientWorseningTrendCheckInRequest
    >({
      invalidatesTags: [{ id: "active", type: "Engagement" as const }],
      query: (body) => ({
        body,
        method: "POST",
        url: "/api/worsening-trends/check-in",
      }),
    }),
    markWorseningTrendViewed: builder.mutation<
      { alertId: string; key: string; viewedAt: string },
      PatientWorseningTrendViewedRequest
    >({
      invalidatesTags: [{ id: "active", type: "Engagement" as const }],
      query: (body) => ({
        body,
        method: "POST",
        url: "/api/worsening-trends/viewed",
      }),
    }),
  }),
  overrideExisting: __DEV__,
});

export const {
  useGetActiveWorseningTrendsQuery,
  useMarkWorseningTrendViewedMutation,
  useSubmitWorseningTrendCheckInMutation,
} = worseningTrendApi;
