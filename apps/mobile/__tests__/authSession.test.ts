jest.mock("react-native", () => ({
  NativeModules: {
    HealthConnectBackgroundSync: {
      clearAuthSession: jest.fn(async () => true),
      syncAuthSession: jest.fn(async () => true),
    },
  },
  Platform: {
    OS: "android",
    select: (options: Record<string, string>) =>
      options.android ?? options.default ?? options.ios,
  },
}));

import * as SecureStore from "expo-secure-store";

import {
  clearSessionToken,
  loadSessionToken,
  refreshSessionToken,
  syncNativeAuthSessionMirror,
} from "@/lib/authSession";

const secureStore = SecureStore as jest.Mocked<typeof SecureStore>;
const nativeSyncModule = (
  jest.requireMock("react-native") as {
    NativeModules: {
      HealthConnectBackgroundSync: {
        clearAuthSession: jest.Mock;
        syncAuthSession: jest.Mock;
      };
    };
  }
).NativeModules.HealthConnectBackgroundSync;

describe("authSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("mirrors session tokens into the Android background module", async () => {
    await syncNativeAuthSessionMirror("jwt-1", "refresh-1");

    expect(nativeSyncModule.syncAuthSession).toHaveBeenCalledWith(
      "jwt-1",
      "refresh-1",
    );
  });

  it("loads stored tokens and mirrors them for background sync", async () => {
    secureStore.getItemAsync
      .mockResolvedValueOnce("jwt-2")
      .mockResolvedValueOnce("refresh-2");

    const result = await loadSessionToken();

    expect(result).toEqual({ jwt: "jwt-2", refreshToken: "refresh-2" });
    expect(nativeSyncModule.syncAuthSession).toHaveBeenCalledWith(
      "jwt-2",
      "refresh-2",
    );
  });

  it("clears secure store and native background auth state", async () => {
    await clearSessionToken();

    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith("ckd_jwt");
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith("ckd_refresh");
    expect(nativeSyncModule.clearAuthSession).toHaveBeenCalled();
  });

  it("refreshes the session and updates the native Android mirror", async () => {
    secureStore.getItemAsync.mockResolvedValueOnce("refresh-old");
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      json: async () => ({
        data: {
          jwt: "jwt-new",
          refreshToken: "refresh-new",
        },
        ok: true,
      }),
      ok: true,
    });

    const refreshed = await refreshSessionToken();

    expect(refreshed).toBe(true);
    expect(secureStore.setItemAsync).toHaveBeenCalledWith("ckd_jwt", "jwt-new");
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      "ckd_refresh",
      "refresh-new",
    );
    expect(nativeSyncModule.syncAuthSession).toHaveBeenCalledWith(
      "jwt-new",
      "refresh-new",
    );
  });
});
