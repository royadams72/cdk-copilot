import type {
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from "@reduxjs/toolkit/query";
import type { SerializedError } from "@reduxjs/toolkit";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

import { API } from "@/constants/api";
import {
  handleMembershipInactiveSession,
  hasMembershipInactiveSession,
  refreshSessionTokenOnce,
} from "@/lib/authSession";
import { formatApiError } from "@/lib/formatApiError";
import { secureStorage } from "@/lib/secureStorage";

type ApiEnvelope<T> = {
  code?: string;
  data?: T;
  errors?: unknown;
  message?: string;
  ok?: boolean;
};

function hasMembershipInactiveCode(data: unknown) {
  if (!data || typeof data !== "object") {
    return false;
  }

  const candidate = data as {
    code?: string;
    errors?: { code?: string };
  };

  return (
    candidate.code === "membership_inactive" ||
    candidate.errors?.code === "membership_inactive"
  );
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API,
  prepareHeaders: async (headers) => {
    const jwt = await secureStorage.getItem("ckd_jwt");
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
  const requestLabel =
    typeof args === "string"
      ? { method: "GET", url: args }
      : {
          method: args.method ?? "GET",
          url: typeof args.url === "string" ? args.url : "unknown",
        };

  if (hasMembershipInactiveSession()) {
    console.log("[membership] appApi:blocked-by-local-flag", requestLabel);
    return {
      error: {
        data: {
          code: "membership_inactive",
          message: "Your membership is no longer active.",
        },
        status: 403,
      },
    };
  }

  let result = await rawBaseQuery(args, api, extraOptions);
  if (result.error) {
    console.log("[membership] appApi:first-response-error", {
      ...requestLabel,
      hasMembershipInactive: hasMembershipInactiveCode(result.error.data),
      status: result.error.status,
    });
  }
  if (result.error?.status === 401) {
    const refreshed = await refreshSessionTokenOnce();
    if (refreshed) {
      console.log("[membership] appApi:retrying-after-refresh", requestLabel);
      result = await rawBaseQuery(args, api, extraOptions);
      if (result.error) {
        console.log("[membership] appApi:retry-response-error", {
          ...requestLabel,
          hasMembershipInactive: hasMembershipInactiveCode(result.error.data),
          status: result.error.status,
        });
      }
    }
  }

  if (
    result.error?.status === 403 &&
    hasMembershipInactiveCode(result.error.data)
  ) {
    console.log("[membership] appApi:api-returned-membership-inactive", requestLabel);
    await handleMembershipInactiveSession();
  }

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
  tagTypes: [
    "Dashboard",
    "Fitness",
    "Medication",
    "MedicationHistory",
    "CarePlan",
    "Food",
    "Targets",
    "Engagement",
    "Symptoms",
  ],
});

export function toQueryErrorMessage(error: unknown, fallback: string) {
  if (!error) return fallback;

  const fetchError = error as FetchBaseQueryError;
  if ("status" in fetchError) {
    const payload = fetchError.data as
      | { errors?: unknown; message?: string }
      | undefined;
    if (payload?.message || payload?.errors) {
      return formatApiError(
        typeof fetchError.status === "number" ? fetchError.status : 400,
        payload,
      );
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
