// secureStorage.ts
import * as SecureStore from "expo-secure-store";

const sanitizeKey = (key: string) => key.replace(/[^a-zA-Z0-9._-]/g, "_");

export const secureStorage = {
  getItem: (key: string) => {
    return SecureStore.getItemAsync(sanitizeKey(key));
  },
  setItem: (key: string, value: string) => {
    return SecureStore.setItemAsync(sanitizeKey(key), value);
  },
  removeItem: (key: string) => {
    return SecureStore.deleteItemAsync(sanitizeKey(key));
  },
};
