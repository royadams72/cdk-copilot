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
    "\\.(css|less|scss|sass)$": "identity-obj-proxy",
    "^@/(.*)$": "<rootDir>/src/$1",
    "^core/(.*)$": "<rootDir>/../../packages/core/src/$1",
    "^core$": "<rootDir>/../../packages/core/src/index.ts",
    "^networking/(.*)$": "<rootDir>/../../packages/networking/src/$1",
    "^networking$": "<rootDir>/../../packages/networking/src/index.ts",
  },
  transform: {
    "^.+\\.(js|jsx)$": "babel-jest",
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        babelConfig: false,
        tsconfig: "<rootDir>/tsconfig.json",
      },
    ],
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testPathIgnorePatterns: ["/node_modules/", "/.expo/"],
  transformIgnorePatterns: [
    "node_modules/(?!(?:\\.pnpm/)?(?:react-native|@react-native|@react-native-community|expo|expo(?:-.*)?|@expo(?:\\+.*|/.*)?|react-native-gesture-handler|react-native-reanimated|@react-navigation(?:\\+.*|/.*)?|react-native-screens|react-native-safe-area-context|react-native-svg))",
  ],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!**/node_modules/**",
  ],
};
