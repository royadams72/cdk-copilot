module.exports = {
  displayName: "mobile",
  testEnvironment: "node",
  roots: ["<rootDir>"],
  testMatch: [
    "**/__tests__/**/*.test.{ts,tsx}",
    "**/?(*.)+(spec|test).{ts,tsx}",
  ],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^core$": "<rootDir>/../../packages/core/src/index.ts",
    "^core/(.*)$": "<rootDir>/../../packages/core/src/$1",
    "^networking$": "<rootDir>/../../packages/networking/src/index.ts",
    "^networking/(.*)$": "<rootDir>/../../packages/networking/src/$1",
    "\\.(css|less|scss|sass)$": "identity-obj-proxy",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.json",
        isolatedModules: true,
        babelConfig: false,
      },
    ],
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testPathIgnorePatterns: ["/node_modules/", "/.expo/"],
  transformIgnorePatterns: [
    "node_modules/(?!(react-native|@react-native|@react-native-community|expo|react-native-gesture-handler|react-native-reanimated|@react-navigation|react-native-screens|react-native-safe-area-context|react-native-svg)/)",
  ],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!**/node_modules/**",
  ],
};
