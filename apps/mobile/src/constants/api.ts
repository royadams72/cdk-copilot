import { Platform } from "react-native";

const fallbackApi =
  Platform.select({
    ios: "http://127.0.0.1:3000",
    android: "http://10.0.2.2:3000",
    default: "http://localhost:3000",
  }) || "http://localhost:3000";

const configuredApi = process.env.EXPO_PUBLIC_API_URL?.trim();

export const API = (configuredApi?.replace(/\/+$/, "") || fallbackApi) as string;
