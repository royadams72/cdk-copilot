jest.mock("@react-native-async-storage/async-storage", () => {
  const storage = {
    clear: jest.fn(async () => {}),
    getItem: jest.fn(async () => null),
    removeItem: jest.fn(async () => {}),
    setItem: jest.fn(async () => {}),
  };

  return {
    __esModule: true,
    ...storage,
    default: storage,
  };
});

import {
  clearStoredHealthConnectChangesState,
  failedMeasurementRetryMs,
  loadStoredHealthConnectChangesState,
  saveStoredHealthConnectChangesState,
} from "@/lib/healthConnectSyncState";

const asyncStorage = jest.requireMock(
  "@react-native-async-storage/async-storage",
) as {
  default: {
    getItem: jest.Mock;
    removeItem: jest.Mock;
    setItem: jest.Mock;
  };
  getItem: jest.Mock;
  removeItem: jest.Mock;
  setItem: jest.Mock;
};

describe("healthConnectSyncState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("saves and reloads the stored changes token state", async () => {
    asyncStorage.default.setItem.mockResolvedValueOnce(undefined);
    asyncStorage.default.getItem.mockResolvedValueOnce(
      JSON.stringify({
        token: "token-123",
        updatedAt: "2026-06-08T10:00:00.000Z",
      }),
    );

    await saveStoredHealthConnectChangesState("token-123");
    const state = await loadStoredHealthConnectChangesState();

    expect(asyncStorage.default.setItem).toHaveBeenCalledWith(
      "health-connect:sync:changes-token:v1",
      expect.stringContaining("\"token\":\"token-123\""),
    );
    expect(state).toEqual({
      token: "token-123",
      updatedAt: "2026-06-08T10:00:00.000Z",
    });
  });

  it("ignores corrupt stored state and supports clearing it", async () => {
    asyncStorage.default.getItem.mockResolvedValueOnce("{bad-json");
    asyncStorage.default.removeItem.mockResolvedValueOnce(undefined);

    const state = await loadStoredHealthConnectChangesState();
    await clearStoredHealthConnectChangesState();

    expect(state).toBeNull();
    expect(asyncStorage.default.removeItem).toHaveBeenCalledWith(
      "health-connect:sync:changes-token:v1",
    );
  });

  it("keeps the retry window stable", () => {
    expect(failedMeasurementRetryMs()).toBe(10 * 60_000);
  });
});
