import { refreshSessionTokenOnce } from "@/lib/authSession";
import { secureStorage } from "@/lib/secureStorage";

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
  if (response.status !== 401) {
    return response;
  }

  const refreshed = await refreshSessionTokenOnce();
  if (!refreshed) {
    return response;
  }

  response = await makeRequest();
  return response;
}
