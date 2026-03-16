import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/index.ts",
    "!src/**/*.d.ts",
    "!src/generated/**",
  ],
  resetMocks: true,
  // Strip .js from relative imports so Jest resolves .ts source files.
  // Source files use .js extensions for ESM (NodeNext), but tests run as CJS.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          // Tests run as CJS under jest — override the ESM settings.
          rootDir: ".",
          module: "commonjs",
          moduleResolution: "node",
        },
      },
    ],
  },
};

export default config;
