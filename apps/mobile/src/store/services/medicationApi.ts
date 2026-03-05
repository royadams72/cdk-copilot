import { appApi } from "./appApi";
import type {
  DrugSuggestion,
  MedicationDetail,
  MedicationHistoryResponse,
  SaveMedicationPayload,
} from "@/screens/medication/types";

export const medicationApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    createMedication: builder.mutation<MedicationDetail, SaveMedicationPayload>(
      {
        invalidatesTags: [
          { id: "today", type: "Dashboard" },
          { id: "all", type: "Dashboard" },
          { id: "LIST", type: "MedicationHistory" },
        ],
        query: (body) => ({
          body,
          method: "POST",
          url: "/api/medications/create",
        }),
      },
    ),
    getMedicationById: builder.query<MedicationDetail, string>({
      providesTags: (_result, _error, id) => [
        { id, type: "Medication" as const },
      ],
      query: (id) => `/api/medications/${id}`,
    }),
    getMedicationHistory: builder.query<MedicationHistoryResponse, void>({
      providesTags: (result) => [
        { id: "LIST", type: "MedicationHistory" as const },
        ...(result?.items?.map((item) => ({
          id: item.id,
          type: "Medication" as const,
        })) ?? []),
      ],
      query: () => "/api/medications/history",
    }),
    searchMedication: builder.query<
      { items: DrugSuggestion[] },
      { limit?: number; query: string }
    >({
      query: ({ limit = 8, query }) =>
        `/api/medications/search?query=${encodeURIComponent(query)}&limit=${limit}`,
    }),
    updateMedication: builder.mutation<
      MedicationDetail,
      { id: string; payload: SaveMedicationPayload }
    >({
      invalidatesTags: (_result, _error, arg) => [
        { id: arg.id, type: "Medication" },
        { id: "today", type: "Dashboard" },
        { id: "all", type: "Dashboard" },
        { id: "LIST", type: "MedicationHistory" },
      ],
      query: ({ id, payload }) => ({
        body: payload,
        method: "PATCH",
        url: `/api/medications/${id}`,
      }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useCreateMedicationMutation,
  useGetMedicationByIdQuery,
  useGetMedicationHistoryQuery,
  useLazySearchMedicationQuery,
  useUpdateMedicationMutation,
} = medicationApi;
