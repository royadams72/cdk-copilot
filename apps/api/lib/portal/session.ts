export type PortalSessionUser = {
  allowedPatientIds: string[];
  careTeamIds: string[];
  facilityIds: string[];
  orgId: string | null;
  principalId: string;
  role: "patient" | "clinician" | "dietitian" | "admin";
  scopes: string[];
};

export type PortalSessionSnapshot = {
  jwt: string;
  refreshToken: string | null;
};

const PORTAL_SESSION_STORAGE_KEY = "ckd_portal_session";

export function readPortalSessionSnapshot(): PortalSessionSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(PORTAL_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PortalSessionSnapshot>;
    if (!parsed.jwt || typeof parsed.jwt !== "string") {
      return null;
    }
    return {
      jwt: parsed.jwt,
      refreshToken:
        typeof parsed.refreshToken === "string" && parsed.refreshToken
          ? parsed.refreshToken
          : null,
    };
  } catch {
    return null;
  }
}

export function savePortalSessionSnapshot(snapshot: PortalSessionSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PORTAL_SESSION_STORAGE_KEY, JSON.stringify(snapshot));
}

export function clearPortalSessionSnapshot() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(PORTAL_SESSION_STORAGE_KEY);
}

export function getPortalSessionAuthHeaders(jwt: string): HeadersInit {
  return {
    authorization: `Bearer ${jwt}`,
  };
}
