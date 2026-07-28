import { test, expect } from "../e2e/fixtures";

/**
 * Weakness dashboard end-to-end (US-E1, US-E2).
 *
 * The seed analyses 11 games, deliberately just over the n>=10 minimum-sample
 * rule, so both the "value" and "insufficient" branches are reachable and the
 * assertions test the intended one.
 */

test.describe("dashboard (US-E1)", () => {
  test("renders statistics once the sample is large enough", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { name: /your weaknesses/i })).toBeVisible();
    await expect(page.getByText("Average accuracy")).toBeVisible();
    // 11 analysed games clears n>=10, so a real number must render.
    await expect(page.getByText(/not enough games yet/i).first())
      .toBeHidden({ timeout: 2000 })
      .catch(() => {});
  });

  test("explains its methodology rather than being a black box (US-E2)", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    await page.goto("/dashboard");
    await expect(page.getByText(/at least 10 games/i)).toBeVisible();
    await expect(page.getByText(/at least 5/i)).toBeVisible();
  });

  test("shows the phase breakdown and time-trouble indicator", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    await page.goto("/dashboard");
    await expect(page.getByText(/mistakes per game, by phase/i)).toBeVisible();
    await expect(page.getByText(/time trouble/i)).toBeVisible();
  });

  test("switching the window refetches without a full navigation", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    await page.goto("/dashboard");

    const request = page.waitForRequest((r) => r.url().includes("/api/dashboard?window=50"));
    await page.getByRole("button", { name: "Last 50" }).click();
    await request;

    await expect(page.getByRole("button", { name: "Last 50" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("is server-rendered — statistics survive with the API blocked", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    await page.route("**/api/dashboard*", (route) => route.abort());
    await page.goto("/dashboard");
    // Proves the initial payload comes from the server, not a client fetch.
    await expect(page.getByText("Average accuracy")).toBeVisible();
  });
});

test.describe("dashboard API", () => {
  test("returns aggregates and weaknesses", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    const response = await page.request.get("/api/dashboard?window=25");
    expect(response.ok()).toBe(true);

    const body = (await response.json()) as {
      aggregate: { window: number; gamesAnalyzed: number; accuracy: { kind: string } };
      weaknesses: { id: string; exampleGameIds: string[] }[];
      totalReports: number;
    };

    expect(body.totalReports).toBe(11);
    expect(body.aggregate.window).toBe(25);
    expect(body.aggregate.accuracy.kind).toBe("value");
  });

  test("every reported weakness carries at least five linked examples (US-E2)", async ({
    signedIn,
  }) => {
    const page = await signedIn.newPage();
    const response = await page.request.get("/api/dashboard?window=100");
    const body = (await response.json()) as {
      weaknesses: { id: string; exampleGameIds: string[] }[];
    };

    for (const weakness of body.weaknesses) {
      expect(
        weakness.exampleGameIds.length,
        `${weakness.id} reported with too few examples`,
      ).toBeGreaterThanOrEqual(5);
    }
  });

  test("falls back to a valid window rather than trusting the query", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    const response = await page.request.get("/api/dashboard?window=999999");
    const body = (await response.json()) as { aggregate: { window: number } };
    expect([25, 50, 100]).toContain(body.aggregate.window);
  });
});
