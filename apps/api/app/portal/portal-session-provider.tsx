"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  clearPortalSessionSnapshot,
  getPortalSessionAuthHeaders,
  readPortalSessionSnapshot,
  savePortalSessionSnapshot,
  type PortalSessionSnapshot,
  type PortalSessionUser,
} from "@/apps/api/lib/portal/session";

type PortalSessionState =
  | { status: "loading" | "unauthenticated"; session: null }
  | { status: "authenticated"; session: PortalSessionSnapshot & { user: PortalSessionUser } };

type LogoutReason = "idle" | "manual" | "expired";

type PortalSessionContextValue = {
  clearWarning: () => void;
  isLeaderTab: boolean;
  lastActivityAt: number;
  logout: (reason: LogoutReason) => void;
  session: (PortalSessionSnapshot & { user: PortalSessionUser }) | null;
  status: PortalSessionState["status"];
  warningOpen: boolean;
};

const WARNING_AT_MS = 18 * 60 * 1000;
const LOGOUT_AT_MS = 20 * 60 * 1000;
const KEEPALIVE_MS = 5 * 60 * 1000;
const HEARTBEAT_MS = 5 * 1000;
const LEADER_STALE_MS = HEARTBEAT_MS * 3;
const CHANNEL_NAME = "ckd-portal-session";
const STORAGE_KEYS = {
  lastActivityAt: "ckd_portal_last_activity_at",
  leader: "ckd_portal_leader",
  logoutAt: "ckd_portal_logout_at",
  warning: "ckd_portal_warning",
} as const;

const PortalSessionContext = createContext<PortalSessionContextValue | null>(null);

function portalSessionMatches(
  currentState: PortalSessionState,
  nextSession: PortalSessionSnapshot & { user: PortalSessionUser },
) {
  if (currentState.status !== "authenticated") {
    return false;
  }

  return (
    currentState.session.jwt === nextSession.jwt &&
    currentState.session.refreshToken === nextSession.refreshToken &&
    JSON.stringify(currentState.session.user) === JSON.stringify(nextSession.user)
  );
}

function useEventCallback<TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => TResult,
) {
  const callbackRef = useRef(callback);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback((...args: TArgs) => callbackRef.current(...args), []);
}

function readJson<T>(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(key);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

export function PortalSessionProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<PortalSessionState>({ status: "loading", session: null });
  const [warningOpen, setWarningOpen] = useState(false);
  const [lastActivityAt, setLastActivityAt] = useState(() => Date.now());
  const [isLeaderTab, setIsLeaderTab] = useState(false);
  const stateRef = useRef<PortalSessionState>(state);
  const tabIdRef = useRef("");
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const logout = useEventCallback((reason: LogoutReason) => {
    clearPortalSessionSnapshot();
    window.sessionStorage.clear();
    writeJson(STORAGE_KEYS.logoutAt, { at: Date.now(), reason, tabId: tabIdRef.current });
    channelRef.current?.postMessage({ type: "logout", reason });
    setWarningOpen(false);
    setIsLeaderTab(false);
    setState({ status: "unauthenticated", session: null });
    router.push("/login");
  });

  const noteActivity = useEventCallback(() => {
    const at = Date.now();
    setLastActivityAt(at);
    writeJson(STORAGE_KEYS.lastActivityAt, { at, tabId: tabIdRef.current });
    if (warningOpen) {
      setWarningOpen(false);
      writeJson(STORAGE_KEYS.warning, { open: false, tabId: tabIdRef.current, at });
      channelRef.current?.postMessage({ type: "warning-close" });
    }
    channelRef.current?.postMessage({ type: "activity", at });
  });

  const fetchSession = useEventCallback(async (snapshot: PortalSessionSnapshot) => {
    const response = await fetch("/api/portal/session", {
      headers: getPortalSessionAuthHeaders(snapshot.jwt),
    });

    if (response.ok) {
      const body = (await response.json()) as {
        data: {
          user: PortalSessionUser;
        };
      };
      const nextState = {
        status: "authenticated",
        session: {
          ...snapshot,
          user: body.data.user,
        },
      } satisfies PortalSessionState;

      if (!portalSessionMatches(stateRef.current, nextState.session)) {
        setState(nextState);
      }

      return true;
    }

    return false;
  });

  const refreshSession = useEventCallback(async () => {
    const snapshot = readPortalSessionSnapshot();
    if (!snapshot?.refreshToken) {
      logout("expired");
      return false;
    }

    const response = await fetch("/api/users/refresh-token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ refreshToken: snapshot.refreshToken }),
    });

    const body = (await response.json().catch(() => null)) as
      | {
          data?: {
            jwt?: string;
            refreshToken?: string;
          };
        }
      | null;

    const nextJwt = body?.data?.jwt?.trim();
    if (!response.ok || !nextJwt) {
      logout("expired");
      return false;
    }

    const nextSnapshot = {
      jwt: nextJwt,
      refreshToken: body?.data?.refreshToken?.trim() || snapshot.refreshToken,
    };
    savePortalSessionSnapshot(nextSnapshot);
    return fetchSession(nextSnapshot);
  });

  const keepAlive = useEventCallback(async () => {
    if (state.status !== "authenticated") {
      return;
    }

    const response = await fetch("/api/portal/session/keepalive", {
      method: "POST",
      headers: getPortalSessionAuthHeaders(state.session.jwt),
    });

    if (response.status === 401) {
      await refreshSession();
      return;
    }

    if (!response.ok) {
      console.warn("portal keepalive failed", response.status);
    }
  });

  const checkIdleState = useEventCallback(() => {
    const age = Date.now() - lastActivityAt;

    if (age >= LOGOUT_AT_MS) {
      logout("idle");
      return;
    }

    if (age >= WARNING_AT_MS && isLeaderTab && !warningOpen) {
      setWarningOpen(true);
      writeJson(STORAGE_KEYS.warning, { open: true, tabId: tabIdRef.current, at: Date.now() });
      channelRef.current?.postMessage({ type: "warning-open" });
    }
  });

  useEffect(() => {
    tabIdRef.current = `tab_${crypto.randomUUID()}`;
    channelRef.current = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL_NAME);

    const snapshot = readPortalSessionSnapshot();
    const storedActivity = readJson<{ at: number }>(STORAGE_KEYS.lastActivityAt);
    const activityAt = storedActivity?.at ?? Date.now();
    setLastActivityAt(activityAt);

    if (!snapshot) {
      setState({ status: "unauthenticated", session: null });
      if (pathname !== "/login") {
        router.push("/login");
      }
    } else {
      fetchSession(snapshot).then((ok) => {
        if (!ok) {
          refreshSession();
        }
      });
    }

    const channel = channelRef.current;

    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEYS.lastActivityAt && event.newValue) {
        const payload = JSON.parse(event.newValue) as { at: number };
        setLastActivityAt(payload.at);
      }

      if (event.key === STORAGE_KEYS.logoutAt && event.newValue) {
        setState({ status: "unauthenticated", session: null });
        setWarningOpen(false);
        router.push("/login");
      }

      if (event.key === STORAGE_KEYS.warning && event.newValue) {
        const payload = JSON.parse(event.newValue) as { open: boolean; tabId: string };
        if (payload.tabId !== tabIdRef.current) {
          setWarningOpen(false);
        }
      }
    }

    function onMessage(event: MessageEvent) {
      const message = event.data as { at?: number; reason?: LogoutReason; type: string };
      if (message.type === "activity" && typeof message.at === "number") {
        setLastActivityAt(message.at);
      }
      if (message.type === "warning-close") {
        setWarningOpen(false);
      }
      if (message.type === "logout") {
        setState({ status: "unauthenticated", session: null });
        router.push("/login");
      }
    }

    window.addEventListener("storage", onStorage);
    channel?.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("storage", onStorage);
      channel?.removeEventListener("message", onMessage);
      channel?.close();
    };
  }, [fetchSession, pathname, refreshSession, router]);

  useEffect(() => {
    if (state.status !== "authenticated") {
      return;
    }

    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keypress",
      "scroll",
      "touchstart",
    ];

    for (const eventName of events) {
      window.addEventListener(eventName, noteActivity, { passive: true });
    }

    return () => {
      for (const eventName of events) {
        window.removeEventListener(eventName, noteActivity);
      }
    };
  }, [noteActivity, state.status]);

  useEffect(() => {
    if (state.status !== "authenticated") {
      return;
    }

    const interval = window.setInterval(() => {
      const leader = readJson<{ at: number; tabId: string }>(STORAGE_KEYS.leader);
      const now = Date.now();
      const isLeader = !leader || now - leader.at > LEADER_STALE_MS || leader.tabId === tabIdRef.current;

      if (isLeader) {
        writeJson(STORAGE_KEYS.leader, { at: now, tabId: tabIdRef.current });
      }

      setIsLeaderTab(isLeader);
    }, HEARTBEAT_MS);

    return () => window.clearInterval(interval);
  }, [state.status]);

  useEffect(() => {
    if (state.status !== "authenticated") {
      return;
    }

    const interval = window.setInterval(() => {
      checkIdleState();
    }, 1000);

    return () => window.clearInterval(interval);
  }, [checkIdleState, state.status]);

  useEffect(() => {
    if (state.status !== "authenticated" || !isLeaderTab) {
      return;
    }

    const interval = window.setInterval(() => {
      keepAlive();
    }, KEEPALIVE_MS);

    return () => window.clearInterval(interval);
  }, [isLeaderTab, keepAlive, state.status]);

  const value: PortalSessionContextValue = {
    clearWarning: noteActivity,
    isLeaderTab,
    lastActivityAt,
    logout,
    session: state.status === "authenticated" ? state.session : null,
    status: state.status,
    warningOpen,
  };

  return <PortalSessionContext.Provider value={value}>{children}</PortalSessionContext.Provider>;
}

export function usePortalSession() {
  const value = useContext(PortalSessionContext);
  if (!value) {
    throw new Error("usePortalSession must be used within PortalSessionProvider");
  }
  return value;
}
