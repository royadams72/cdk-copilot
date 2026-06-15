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
const PORTAL_STATE_KEYS = {
  lastActivityAt: "ckd_portal_last_activity_at",
  leader: "ckd_portal_leader",
  logoutAt: "ckd_portal_logout_at",
  warning: "ckd_portal_warning",
} as const;

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
  const now = Date.now();
  window.localStorage.setItem(
    PORTAL_STATE_KEYS.lastActivityAt,
    JSON.stringify({ at: now, tabId: "login" }),
  );
  window.localStorage.removeItem(PORTAL_STATE_KEYS.leader);
  window.localStorage.removeItem(PORTAL_STATE_KEYS.logoutAt);
  window.localStorage.setItem(
    PORTAL_STATE_KEYS.warning,
    JSON.stringify({ open: false, tabId: "login", at: now }),
  );
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
