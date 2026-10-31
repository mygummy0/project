import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "services/*/src/**/*.test.*", "tests/**/*.test.ts"],
    environment: "node",
  },
});
