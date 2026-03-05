import type {
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from "@reduxjs/toolkit/query";
import type { SerializedError } from "@reduxjs/toolkit";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import * as SecureStore from "expo-secure-store";

import { API } from "@/constants/api";
import { formatApiError } from "@/lib/formatApiError";

type ApiEnvelope<T> = {
  data?: T;
  errors?: unknown;
  message?: string;
  ok?: boolean;
};

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API,
  prepareHeaders: async (headers) => {
    const jwt = await SecureStore.getItemAsync("ckd_jwt");
    if (jwt) {
      headers.set("Authorization", `Bearer ${jwt}`);
    }
    headers.set("Content-Type", "application/json");
    return headers;
  },
});

const baseQueryWithEnvelope: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (result.error) return result;

  const body = result.data as ApiEnvelope<unknown> | undefined;
  if (body && typeof body === "object" && "ok" in body && "data" in body) {
    if (!body.ok) {
      return {
        error: {
          data: {
            message: formatApiError(200, {
              errors: body.errors,
              message: body.message,
            }),
          },
          status: 200,
        },
      };
    }
    return { data: body.data };
  }

  return result;
};

export const appApi = createApi({
  baseQuery: baseQueryWithEnvelope,
  endpoints: () => ({}),
  reducerPath: "appApi",
  refetchOnMountOrArgChange: false,
  refetchOnReconnect: true,
  tagTypes: ["Dashboard", "Fitness", "Medication", "MedicationHistory", "Food"],
});

export function toQueryErrorMessage(error: unknown, fallback: string) {
  if (!error) return fallback;

  const fetchError = error as FetchBaseQueryError;
  if ("status" in fetchError) {
    const payload = fetchError.data as { message?: string } | undefined;
    if (payload?.message) {
      return payload.message;
    }
    if (typeof fetchError.status === "number") {
      return formatApiError(fetchError.status);
    }
  }

  const serialized = error as SerializedError;
  if (serialized?.message) {
    return serialized.message;
  }

  return fallback;
}
