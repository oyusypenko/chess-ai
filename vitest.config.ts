import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Unit + integration tests colocate with source as *.test.ts.
    // tests/smoke/** runs under `node --test` (needs a real server) and is
    // driven by `npm run test:headers`, not vitest.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["node_modules", ".next", "tests/smoke/**"],
  },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
});
