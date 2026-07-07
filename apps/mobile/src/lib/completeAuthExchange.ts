import { API } from "@/constants/api";
import { getOrCreateAuthDeviceId } from "@/lib/authDevice";
import { syncNativeAuthSessionMirror } from "@/lib/authSession";
import type { MembershipLifecycleSnapshot } from "@/lib/membership";
import { secureStorage } from "@/lib/secureStorage";

type ExchangeResponse = {
  activeAssignmentCount?: number | null;
  hasActiveAssignments?: boolean | null;
  hasPendingConsents?: boolean | null;
  jwt?: string;
  membership?: Partial<MembershipLifecycleSnapshot> | null;
  onboardingCompleted?: boolean;
  onboardingSteps?: string[] | null;
  refreshToken?: string | null;
};

export async function completeAuthExchange(token: string) {
  const deviceId = await getOrCreateAuthDeviceId();
  const res = await fetch(`${API}/api/auth/exchange`, {
    body: JSON.stringify({ deviceId, token }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  const data = (await res.json().catch(() => ({}))) as ExchangeResponse & {
    error?: string;
    message?: string;
  };

  if (!res.ok || !data.jwt) {
    throw new Error(data.error || data.message || "Authentication failed");
  }

  await secureStorage.setItem("ckd_jwt", data.jwt);
  if (data.refreshToken) {
    await secureStorage.setItem("ckd_refresh", data.refreshToken);
  }
  await syncNativeAuthSessionMirror(data.jwt, data.refreshToken ?? null);

  return data;
}
