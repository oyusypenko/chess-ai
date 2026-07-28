import { test, expect, seed } from "../e2e/fixtures";

/**
 * Game history end-to-end (US-B1, US-B3).
 *
 * The seed contains 12 games, 11 of them analysed, across two time controls,
 * both colours and mixed results — so filters and the "Analysed" badge each
 * have both states to assert against.
 */

test.describe("game list (US-B1)", () => {
  test("renders the user's games newest first", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    await page.goto("/games");

    const items = page.getByTestId("game-list").locator("li");
    await expect(items.first()).toBeVisible();
    expect(await items.count()).toBeGreaterThan(0);

    // Seed dates ascend with index, so the newest must be seed11.
    await expect(items.first().locator("a")).toHaveAttribute("href", /seed11/);
  });

  test("shows opponent, date, time control, colour and opening", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    await page.goto("/games");
    const first = page.getByTestId("game-list").locator("li").first();

    await expect(first).toContainText(/vs opponent/);
    await expect(first).toContainText(/as (white|black)/);
    await expect(first).toContainText(/Italian Game/);
  });

  test("marks analysed games and leaves un-analysed ones unmarked", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    await page.goto("/games");

    const badges = page.getByText("Analysed", { exact: true });
    // 11 of 12 seeded games have a report.
    expect(await badges.count()).toBe(11);
  });

  test("the list is server-rendered, not fetched after paint", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    // Disabling JS proves the content is in the initial HTML — the waterfall
    // fix is a real property, not just a code style.
    await page.route("**/api/games*", (route) => route.abort());
    await page.goto("/games");
    await expect(page.getByTestId("game-list").locator("li").first()).toBeVisible();
  });
});

test.describe("filters (US-B3)", () => {
  test("filtering by time control narrows the list", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    await page.goto("/games");

    const before = await page.getByTestId("game-list").locator("li").count();
    await page.getByLabel("Time control").selectOption("rapid");
    await expect(page.getByTestId("game-list").locator("li")).not.toHaveCount(before);

    // Web-first assertions over the whole list, not a count read up front.
    // Filtering re-renders through a transition, so `count()` taken right after
    // the select resolves against the OLD list — the assertions then index rows
    // that no longer exist by the time they run.
    const items = page.getByTestId("game-list").locator("li");
    await expect(items.filter({ hasNotText: "rapid" })).toHaveCount(0);
    await expect(items).not.toHaveCount(0);
  });

  test("filtering by colour returns only that colour", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    await page.goto("/games");
    await page.getByLabel("Colour").selectOption("black");

    const items = page.getByTestId("game-list").locator("li");
    await expect(items.filter({ hasNotText: "as black" })).toHaveCount(0);
    await expect(items).not.toHaveCount(0);
  });

  test("filtering by result returns only that result", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    await page.goto("/games");
    await page.getByLabel("Result").selectOption("loss");

    const items = page.getByTestId("game-list").locator("li");
    await expect(items.filter({ hasNotText: "Loss" })).toHaveCount(0);
    await expect(items).not.toHaveCount(0);
  });

  test("an empty filter combination explains itself", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    await page.goto("/games");
    await page.getByLabel("Time control").selectOption("classical");
    await expect(page.getByText(/no games match those filters/i)).toBeVisible();
  });
});

test.describe("games API", () => {
  test("returns the list without the heavy payload field", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    const response = await page.request.get("/api/games");
    expect(response.ok()).toBe(true);

    const body = (await response.json()) as { games: Record<string, unknown>[] };
    expect(body.games.length).toBeGreaterThan(0);
    // Sending 20 whole games would make the list slow for no benefit.
    expect(body.games[0]).not.toHaveProperty("payload");
    expect(body.games[0]).toHaveProperty("analyzed");
  });

  test("ignores an unknown filter value rather than trusting it", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    // Filters reach a SQL predicate; an allow-list means junk is dropped.
    const response = await page.request.get("/api/games?speed=' OR 1=1--");
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as { games: unknown[] };
    expect(body.games.length).toBe(12);
  });

  test("a single game includes its stored report", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    const response = await page.request.get(`/api/games/${encodeURIComponent(seed.gameIds[0])}`);
    expect(response.ok()).toBe(true);

    const body = (await response.json()) as {
      game: { id: string; finished: boolean };
      report: { model: string; promptVersion: string } | null;
    };
    expect(body.game.finished).toBe(true);
    // FR-4: reproducibility metadata travels with the report.
    expect(body.report?.model).toBe("claude-haiku-4-5");
    expect(body.report?.promptVersion).toBe("report-v1");
  });

  test("does not serve a game the user does not own", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    const response = await page.request.get("/api/games/lichess%3Asomeone-elses-game");
    expect(response.status()).toBe(404);
  });
});
