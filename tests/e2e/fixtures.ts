import { readFileSync } from "node:fs";
import { test as base, expect, type Browser, type BrowserContext } from "@playwright/test";
import type { SeedResult } from "./seed";
import { SEED_FILE } from "./global-setup";

/**
 * Shared fixtures.
 *
 * `signedIn` gives a context whose cookie is a **real session row** created by
 * the seed — the same thing the OAuth callback would have written. Nothing is
 * mocked, so a regression in session validation fails these tests.
 */

export const seed: SeedResult = JSON.parse(readFileSync(SEED_FILE, "utf8"));

async function contextWithSession(
  browser: Browser,
  baseURL: string | undefined,
  sessionId: string,
): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.addCookies([
    { name: "ccai_session", value: sessionId, url: baseURL ?? "http://127.0.0.1:3100" },
  ]);
  return context;
}

export const test = base.extend<{ signedIn: BrowserContext; disposable: BrowserContext }>({
  signedIn: async ({ browser, baseURL }, use) => {
    const context = await contextWithSession(browser, baseURL, seed.sessionId);
    await use(context);
    await context.close();
  },

  /**
   * A throwaway account. Destructive tests use this so they cannot break specs
   * running in parallel, and the suite never depends on file execution order.
   */
  disposable: async ({ browser, baseURL }, use) => {
    const context = await contextWithSession(browser, baseURL, seed.disposable.sessionId);
    await use(context);
    await context.close();
  },
});

export { expect };
