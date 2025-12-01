import { useEffect } from "react";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { authFetch } from "@/lib/authFetch";
import { API } from "@/constants/api";
async function loadSessionToken() {
  const jwt = await SecureStore.getItemAsync("ckd_jwt");
  return jwt;
}

const Bootstrap = () => {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      const token = await loadSessionToken();

      if (!token) {
        router.replace("/(init-app)/welcome");
        return;
      }

      const me = await authFetch(`${API}/api/users/get-user`);
      if (me.ok) {
        router.replace("/(dashboard)/dashboard");
      } else {
        // await clearSessionToken();
        router.replace("/(init-app)/welcome");
      }
    })();
  }, []);
  // TODO: Use loader
  return null;
};

export default Bootstrap;
