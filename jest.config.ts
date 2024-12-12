import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  transform: {
    "\\.[jt]sx?$": ["ts-jest", { useESM: true }]
  },
  moduleNameMapper: {
    "(.+)\\.js$": "$1",
  },
  extensionsToTreatAsEsm: [".ts"],
};

export default config;
