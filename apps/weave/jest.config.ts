import type { Config } from "jest";

const config: Config = {
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "react-jsx",
          module: "commonjs",
          moduleResolution: "node",
          esModuleInterop: true,
          target: "es2020",
          paths: {
            "@/*": ["./src/*"],
          },
        },
      },
    ],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.(css|less|scss)$": "<rootDir>/src/__mocks__/style.js",
  },
  testMatch: ["**/__tests__/**/*.test.(ts|tsx)"],
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/", "<rootDir>/tests/e2e/"],
  setupFilesAfterEnv: ["<rootDir>/src/test-setup.ts"],
};

export default config;
