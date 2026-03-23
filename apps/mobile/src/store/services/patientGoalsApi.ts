import {
  TPatientGoalsCurrent,
  TPatientGoalsUpdateRequest,
} from "@ckd/core";

import { appApi } from "./appApi";

const patientGoalsApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getPatientGoals: builder.query<
      { current: TPatientGoalsCurrent | null; requestId?: string },
      void
    >({
      providesTags: [{ id: "patient-goals", type: "Targets" as const }],
      query: () => "/api/patient-goals",
    }),
    updatePatientGoals: builder.mutation<
      { current: TPatientGoalsCurrent | null; requestId?: string },
      TPatientGoalsUpdateRequest
    >({
      invalidatesTags: [{ id: "patient-goals", type: "Targets" as const }],
      query: (body) => ({
        body,
        method: "PATCH",
        url: "/api/patient-goals",
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetPatientGoalsQuery,
  useUpdatePatientGoalsMutation,
} = patientGoalsApi;
