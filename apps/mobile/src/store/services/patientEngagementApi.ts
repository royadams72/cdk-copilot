import { appApi } from "./appApi";

type PatientEngagementCopy = {
  body?: string;
  title?: string;
};

type PatientEngagementMetadata = {
  copy?: PatientEngagementCopy | null;
  streakLength?: number;
} | null;

export type PendingPatientEngagement = {
  achievedAt: string;
  key: string;
  metadata: PatientEngagementMetadata;
  type: string;
};

export const patientEngagementApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getPendingPatientEngagement: builder.query<PendingPatientEngagement | null, void>({
      providesTags: [{ id: "pending", type: "Engagement" as const }],
      query: () => "/api/patient-engagement/pending",
      transformResponse: (response: { achievement?: PendingPatientEngagement | null }) =>
        response?.achievement ?? null,
    }),
    openPatientEngagement: builder.mutation<{ opened?: boolean }, { key: string }>({
      invalidatesTags: [{ id: "pending", type: "Engagement" as const }],
      query: (body) => ({
        body,
        method: "POST",
        url: "/api/patient-engagement/open",
      }),
    }),
  }),
  overrideExisting: __DEV__,
});

export const {
  useGetPendingPatientEngagementQuery,
  useOpenPatientEngagementMutation,
} = patientEngagementApi;
