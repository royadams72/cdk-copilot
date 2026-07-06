import {
  handleMembershipInactiveSession,
  refreshSessionTokenOnce,
} from "@/lib/authSession";
import { secureStorage } from "@/lib/secureStorage";

async function hasMembershipInactiveCode(response: Response) {
  try {
    const data = (await response.clone().json()) as
      | {
          code?: string;
          errors?: { code?: string };
        }
      | undefined;

    return (
      data?.code === "membership_inactive" ||
      data?.errors?.code === "membership_inactive"
    );
  } catch {
    return false;
  }
}

export async function authFetch(input: string, init: RequestInit = {}) {
  const makeRequest = async () => {
    let jwt = await secureStorage.getItem("ckd_jwt");
    if (!jwt) {
      const refreshed = await refreshSessionTokenOnce();
      if (!refreshed) {
        throw new Error("No JWT in SecureStore");
      }
      jwt = await secureStorage.getItem("ckd_jwt");
    }
    if (!jwt) throw new Error("No JWT in SecureStore");
    const headers = new Headers(init.headers || {});
    headers.set("Content-Type", "application/json");
    headers.set("Authorization", `Bearer ${jwt}`);
    return fetch(input, { ...init, headers });
  };

  let response = await makeRequest();
  if (
    response.status === 403 &&
    (await hasMembershipInactiveCode(response))
  ) {
    await handleMembershipInactiveSession();
    return response;
  }

  if (response.status !== 401) {
    return response;
  }

  const refreshed = await refreshSessionTokenOnce();
  if (!refreshed) {
    return response;
  }

  response = await makeRequest();
  if (
    response.status === 403 &&
    (await hasMembershipInactiveCode(response))
  ) {
    await handleMembershipInactiveSession();
  }
  return response;
}
