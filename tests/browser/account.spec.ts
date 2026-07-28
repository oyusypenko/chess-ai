import type { Browser, BrowserContext, Page } from "@playwright/test";
import { test, expect, seed } from "../e2e/fixtures";

/**
 * Account, export and deletion end-to-end (US-A4, US-F3, NFR-PR3).
 *
 * The deletion test runs last and in its own file-serial block, because it
 * destroys the seeded account every other test depends on.
 */

test.describe("account page (US-F3)", () => {
  test("shows the connected account and plan", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    await page.goto("/account");

    await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
    await expect(page.getByText(seed.lichessName, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/free/i).first()).toBeVisible();
  });

  test("states that engine analysis is unlimited and free", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    await page.goto("/account");
    await expect(page.getByText(/engine analysis is unlimited/i)).toBeVisible();
  });

  test("is honest that upgrading is not available yet", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    await page.goto("/account");
    // Better than a button that fails: O-5 is unanswered and the UI says so.
    await expect(page.getByText(/isn.t available yet/i)).toBeVisible();
  });
});

test.describe("data export (US-A4, NFR-PR3)", () => {
  test("JSON export contains games and reports but never the token", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    const response = await page.request.get("/api/account/export?format=json");
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-disposition"]).toContain("attachment");

    const body = (await response.json()) as {
      account: { lichessName: string };
      games: unknown[];
      reports: unknown[];
    };
    expect(body.account.lichessName).toBe(seed.lichessName);
    expect(body.games.length).toBeGreaterThan(0);
    expect(body.reports.length).toBeGreaterThan(0);

    // The OAuth token is our credential, not their personal data — exporting it
    // would be handing out a bearer token.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("lio_seed_token");
    expect(raw).not.toContain("access_token");
  });

  test("PGN export is valid PGN a chess tool can open", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    const response = await page.request.get("/api/account/export?format=pgn");
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("chess-pgn");

    const pgn = await response.text();
    // Seven-tag roster is what makes it readable elsewhere.
    for (const tag of ["[Event ", "[Site ", "[Date ", "[White ", "[Black ", "[Result "]) {
      expect(pgn, `PGN missing ${tag}`).toContain(tag);
    }
    expect(pgn).toMatch(/\[Result "(1-0|0-1|1\/2-1\/2)"\]/);
  });
});

/**
 * Deletion tests each register their OWN account and destroy it.
 *
 * A single seeded throwaway account is not enough: `mobile-360` and
 * `desktop-1280` run against one server and one database, so whichever project
 * deleted it first left the other asserting against an account that no longer
 * existed — a 401 where a 400 was expected, purely as a function of scheduling.
 * An account created inside the test cannot collide with anything.
 */
async function throwawayAccount(browser: Browser): Promise<{
  context: BrowserContext;
  page: Page;
  /** The word the deletion form requires — the email local-part. */
  confirmWord: string;
}> {
  const local = `e2e-del-${Math.random().toString(36).slice(2, 10)}`;
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/register");
  await page.getByLabel("Email").fill(`${local}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("a-throwaway-passphrase");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account/);

  return { context, page, confirmWord: local };
}

test.describe("account deletion (US-A4)", () => {
  test("refuses without the typed confirmation", async ({ browser }) => {
    const { context, page } = await throwawayAccount(browser);

    const response = await page.request.post("/api/account/delete", {
      data: { confirm: "wrong-name" },
    });
    expect(response.status()).toBe(400);

    // The account must still be there.
    expect((await page.request.get("/api/games")).ok()).toBe(true);
    await context.close();
  });

  test("the UI keeps the delete button disabled until the handle matches", async ({ browser }) => {
    const { context, page, confirmWord } = await throwawayAccount(browser);

    await page.goto("/account");
    await page.getByRole("button", { name: /delete my account/i }).click();

    const confirm = page.getByRole("button", { name: /delete permanently/i });
    await expect(confirm).toBeDisabled();

    // Scoped by name: the page now has several textboxes (password fields).
    await page.getByRole("textbox", { name: /type .* to confirm/i }).fill(confirmWord);
    await expect(confirm).toBeEnabled();
    await context.close();
  });

  test("deletes the account and every row that cascades from it", async ({ browser }) => {
    const { context, page, confirmWord } = await throwawayAccount(browser);

    const response = await page.request.post("/api/account/delete", {
      data: { confirm: confirmWord },
    });
    expect(response.ok()).toBe(true);

    // The session is gone with the user, so the same cookie is now anonymous.
    expect((await page.request.get("/api/games")).status()).toBe(401);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });
});
