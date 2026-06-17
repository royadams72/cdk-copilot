import { appApi } from "./appApi";
import type {
  CarePlanDetailResponse,
  CarePlanListResponse,
} from "./types";

export const carePlanApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getCarePlanById: builder.query<CarePlanDetailResponse["plan"], string>({
      providesTags: (_result, _error, id) => [{ id, type: "CarePlan" as const }],
      query: (id) => `/api/care-plans/${id}`,
      transformResponse: (response: CarePlanDetailResponse) => response.plan,
    }),
    getCarePlans: builder.query<CarePlanListResponse, void>({
      providesTags: (result) => [
        { id: "LIST", type: "CarePlan" as const },
        ...(result?.items?.map((item) => ({
          id: item.id,
          type: "CarePlan" as const,
        })) ?? []),
      ],
      query: () => "/api/care-plans",
    }),
  }),
  overrideExisting: __DEV__,
});

export const { useGetCarePlanByIdQuery, useGetCarePlansQuery } = carePlanApi;
