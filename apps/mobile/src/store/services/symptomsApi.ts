import { appApi } from "./appApi";
import type {
  CreateSymptomArgs,
  SymptomListResponse,
  UpdateSymptomArgs,
} from "./types";

export const symptomsApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    createSymptom: builder.mutation<
      { current: SymptomListResponse["current"][number]; requestId?: string },
      CreateSymptomArgs
    >({
      invalidatesTags: [{ id: "list", type: "Symptoms" as const }],
      query: (body) => ({
        body,
        method: "POST",
        url: "/api/symptoms",
      }),
    }),
    getSymptoms: builder.query<SymptomListResponse, void>({
      providesTags: [{ id: "list", type: "Symptoms" as const }],
      query: () => "/api/symptoms",
    }),
    updateSymptom: builder.mutation<
      { current: SymptomListResponse["current"][number]; requestId?: string },
      { symptomId: string; body: UpdateSymptomArgs }
    >({
      invalidatesTags: [{ id: "list", type: "Symptoms" as const }],
      query: ({ body, symptomId }) => ({
        body,
        method: "PATCH",
        url: `/api/symptoms/${encodeURIComponent(symptomId)}`,
      }),
    }),
  }),
  overrideExisting: __DEV__,
});

export const {
  useCreateSymptomMutation,
  useGetSymptomsQuery,
  useUpdateSymptomMutation,
} = symptomsApi;
