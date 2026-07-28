import { test, expect, seed } from "../e2e/fixtures";

/**
 * Landing page, header and footer (US-A1, NFR-C2, NFR-L1).
 *
 * The header tests exist because `/login` was previously reachable only by
 * typing the URL — a sign-in page nothing links to is, in practice, a sign-in
 * page that does not exist. These lock that in.
 */

test.describe("landing page", () => {
  test("leads with the problem, not the technology", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/why you lost/i);
  });

  test("offers both entry points", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /connect lichess/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /sample report/i }).first()).toBeVisible();
  });

  test("lists what you get", async ({ page }) => {
    await page.goto("/");
    const features = page.locator("section", {
      has: page.getByRole("heading", { name: /what you get/i }),
    });
    await expect(features.locator("li")).toHaveCount(6);
  });

  test("explains how it works as ordered steps", async ({ page }) => {
    await page.goto("/");
    const how = page.locator("section", {
      has: page.getByRole("heading", { name: /how it works/i }),
    });
    await expect(how.locator("ol > li")).toHaveCount(4);
  });

  test("explains why the write-up can be trusted", async ({ page }) => {
    await page.goto("/");
    // The grounding guarantee is the product's core claim; it must be stated.
    await expect(page.getByText(/every move and square it mentions is checked/i)).toBeVisible();
  });

  test("states the fair-play position without burying it (NFR-L1)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/post-game only/i).first()).toBeVisible();
  });

  test("has exactly one h1 and a sensible heading order (NFR-C2)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    expect(await page.getByRole("heading", { level: 2 }).count()).toBeGreaterThan(1);
  });

  test("does not scroll horizontally at 360px (US-G1)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-360", "360px-specific check");
    await page.goto("/");
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});

test.describe("header", () => {
  test("links to sign-in when anonymous", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header");
    await expect(header.getByRole("link", { name: "Sign in" })).toBeVisible();
    // The gap that made /login unreachable.
    await expect(header.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  test("sign-in link actually reaches the login page", async ({ page }) => {
    await page.goto("/");
    await page.locator("header").getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("link", { name: /continue with lichess/i })).toBeVisible();
  });

  test("shows the account nav when signed in, with no auth flash", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    await page.goto("/");
    const header = page.locator("header");

    // Rendered on the server, so it is correct in the first paint rather than
    // swapping after hydration.
    await expect(header.getByRole("link", { name: seed.lichessName })).toBeVisible();
    await expect(header.getByRole("link", { name: "Games" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  });

  test("the logo returns home from a deep page", async ({ page }) => {
    await page.goto("/privacy");
    await page
      .locator("header")
      .getByRole("link", { name: /chesscoach ai/i })
      .click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("footer", () => {
  test("carries the legal links required before launch", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    for (const name of [/privacy/i, /terms/i, /attribution/i]) {
      await expect(footer.getByRole("link", { name })).toBeVisible();
    }
  });

  test("credits Stockfish and disclaims affiliation (NFR-L3, NFR-L2)", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    await expect(footer).toContainText(/stockfish \(gplv3\)/i);
    await expect(footer).toContainText(/not affiliated/i);
  });

  test("is present on every page", async ({ page }) => {
    for (const path of ["/", "/login", "/privacy", "/report-preview"]) {
      await page.goto(path);
      await expect(page.locator("footer")).toBeVisible();
    }
  });
});
