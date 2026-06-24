import * as SecureStore from "expo-secure-store";

const sanitizeKey = (key: string) => key.replace(/[^a-zA-Z0-9._-]/g, "_");

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : String(error);
}

export function isSecureStoreInteractionBlockedError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("user interaction is not allowed") ||
    message.includes("interaction is not allowed")
  );
}

function logBlockedInteraction(action: string, key: string, error: unknown) {
  if (!__DEV__) {
    return;
  }

  console.log(`[secureStorage] ${action} skipped for ${key}: ${getErrorMessage(error)}`);
}

async function guardSecureStore<T>(
  action: string,
  key: string,
  operation: () => Promise<T>,
  fallback: T,
) {
  try {
    return await operation();
  } catch (error) {
    if (isSecureStoreInteractionBlockedError(error)) {
      logBlockedInteraction(action, key, error);
      return fallback;
    }

    throw error;
  }
}

export const secureStorage = {
  getItem: (key: string) => {
    const nextKey = sanitizeKey(key);
    return guardSecureStore(
      "getItem",
      nextKey,
      () => SecureStore.getItemAsync(nextKey),
      null,
    );
  },
  setItem: (key: string, value: string) => {
    const nextKey = sanitizeKey(key);
    return guardSecureStore(
      "setItem",
      nextKey,
      () => SecureStore.setItemAsync(nextKey, value),
      undefined,
    );
  },
  removeItem: (key: string) => {
    const nextKey = sanitizeKey(key);
    return guardSecureStore(
      "removeItem",
      nextKey,
      () => SecureStore.deleteItemAsync(nextKey),
      undefined,
    );
  },
};
