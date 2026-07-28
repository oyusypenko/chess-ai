import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests (D-08, FR-7).
 *
 * **Mobile-first**: the default project is a 360 px viewport, because that is
 * the width US-G1 requires and the one most of our users are on. Wider
 * viewports are additional projects, not the baseline — a layout verified only
 * at 1280 has not been verified.
 */
export default defineConfig({
  testDir: "./tests/browser",
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

  // Production server, not dev: COOP/COEP and the engine payload must be
  // verified as they actually ship.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npx next start --port 3100",
        url: "http://127.0.0.1:3100",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
