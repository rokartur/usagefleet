import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "collector/**/*.test.ts"],
    environment: "node",
  },
});
