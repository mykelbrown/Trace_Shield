import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: [
      // See vitest.sqlite-shim.ts for why this alias exists (Vitest-only workaround).
      { find: /^node:sqlite$/, replacement: fileURLToPath(new URL("./vitest.sqlite-shim.ts", import.meta.url)) },
    ],
  },
  test: {
    environment: "node",
    include: ["packages/**/test/**/*.test.ts", "packages/**/src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**"],
    globals: false,
  },
});
