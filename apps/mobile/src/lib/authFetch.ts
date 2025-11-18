import * as SecureStore from "expo-secure-store";

export async function authFetch(input: string, init: RequestInit = {}) {
  const jwt = await SecureStore.getItemAsync("ckd_jwt");
  if (!jwt) throw new Error("No JWT in SecureStore");
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${jwt}`);
  return fetch(input, { ...init, headers });
}
