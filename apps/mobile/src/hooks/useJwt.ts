import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
const jwtName = process.env.NEXT_PUBLIC_JWT;

export function useJwt() {
  const [jwt, setJwt] = useState<string | null>(null);
  useEffect(() => {
    if (!jwtName) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    SecureStore.getItemAsync(jwtName).then(setJwt);
  }, []);
  return jwt;
}
