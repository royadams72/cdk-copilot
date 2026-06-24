import { useEffect, useState } from "react";
import { secureStorage } from "@/lib/secureStorage";

const jwtName = process.env.NEXT_PUBLIC_JWT;

export function useJwt() {
  const [jwt, setJwt] = useState<string | null>(null);
  useEffect(() => {
    if (!jwtName) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    void secureStorage.getItem(jwtName).then(setJwt);
  }, []);
  return jwt;
}
