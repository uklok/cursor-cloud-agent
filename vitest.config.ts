import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/*/src/**/*.test.ts"],
    restoreMocks: true,
  },
  resolve: {
    alias: {
      "cursor-cloud-core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
    },
  },
});
