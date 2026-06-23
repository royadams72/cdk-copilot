import type { PatientWorseningTrendAlertsResponse } from "@ckd/core";

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
  }),
  overrideExisting: __DEV__,
});

export const { useGetActiveWorseningTrendsQuery } = worseningTrendApi;
