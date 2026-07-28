import { defineConfig, devices } from "@playwright/test";

/**
 * Browser + API end-to-end tests (D-08, FR-7).
 *
 * **Mobile-first**: the default project is a 360 px viewport, because that is
 * the width US-G1 requires and the one most of our users are on. Wider
 * viewports are additional projects, not the baseline — a layout verified only
 * at 1280 has not been verified.
 *
 * The server runs against a seeded SQLite database (`tests/e2e/seed.ts`) so
 * authenticated flows are exercised through real session rows rather than a
 * test-only login endpoint, which would be an authentication bypass shipped in
 * production code.
 */

const TEST_DB = ".data/e2e.sqlite";

export default defineConfig({
  testDir: "./tests/browser",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "list" : "line",

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "mobile-360",
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 } },
    },
    {
      name: "desktop-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],

  // Production server, not dev: COOP/COEP, the engine payload, and route
  // rendering must be verified as they actually ship.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npx next start --port 3100",
        url: "http://127.0.0.1:3100",
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          LOCAL_DB_PATH: TEST_DB,
          // Deterministic key so the seeded token decrypts. Test-only value —
          // production reads this from the environment and refuses to run
          // without it.
          TOKEN_ENCRYPTION_KEY: "dGVzdC1rZXktMzItYnl0ZXMtZm9yLWUyZS1vbmx5ISE=",
          LICHESS_CLIENT_ID: "chesscoach-e2e",
        },
      },
});
