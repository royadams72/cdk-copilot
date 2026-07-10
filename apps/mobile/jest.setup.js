// Mock expo-secure-store
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

// Mock redux-persist
jest.mock("redux-persist", () => ({
  persistReducer: jest.fn((config, reducer) => reducer),
  persistStore: jest.fn((store, config, callback) => {
    if (callback) callback();
    return store;
  }),
  REHYDRATE: "persist/REHYDRATE",
}));

// Mock Expo modules
jest.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {},
    },
  },
}));

jest.mock("expo-linking", () => ({
  createURL: jest.fn((path) => `exp://localhost:19000${path}`),
  addEventListener: jest.fn(),
}));

jest.mock("expo-router", () => {
  const router = {
    back: jest.fn(),
    canGoBack: jest.fn(() => false),
    dismiss: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    setParams: jest.fn(),
  };

  return {
    router,
    useLocalSearchParams: jest.fn(() => ({})),
    useNavigation: jest.fn(() => ({
      goBack: jest.fn(),
      setOptions: jest.fn(),
    })),
    useRouter: jest.fn(() => router),
    useSegments: jest.fn(() => []),
  };
});

jest.mock("expo-notifications", () => ({
  addNotificationReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({
    granted: true,
    status: "granted",
  })),
  scheduleNotificationAsync: jest.fn(async () => "mock-notification-id"),
  setNotificationHandler: jest.fn(),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
}));

// Set environment variables
process.env.EXPO_PUBLIC_API_URL = "http://localhost:3000";

global.__DEV__ = false;
