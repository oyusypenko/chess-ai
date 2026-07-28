import { test, expect, seed } from "../e2e/fixtures";

/**
 * Authentication end-to-end (US-A2, NFR-S1).
 *
 * Exercises the real session machinery: the cookie carries a session row the
 * seed created, exactly as the OAuth callback would have written it.
 */

test.describe("anonymous access is refused", () => {
  for (const path of ["/games", "/dashboard", "/account"]) {
    test(`${path} redirects to login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
      // The intended destination survives the round trip, so the user lands
      // where they meant to go after signing in. A slash is legal unencoded in
      // a query value, so compare the decoded parameter rather than the raw
      // string.
      expect(new URL(page.url()).searchParams.get("redirect_to")).toBe(path);
    });
  }

  for (const path of ["/api/games", "/api/dashboard", "/api/account/export"]) {
    test(`${path} returns 401`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(401);
    });
  }

  test("POST endpoints also refuse anonymous callers", async ({ request }) => {
    expect((await request.post("/api/games/sync")).status()).toBe(401);
    expect((await request.post("/api/account/delete", { data: {} })).status()).toBe(401);
  });
});

test.describe("OAuth start (US-A2)", () => {
  test("redirects to Lichess with a PKCE S256 challenge and no verifier", async ({ page }) => {
    const response = await page.request.get("/api/auth/login?redirect_to=/games", {
      maxRedirects: 0,
    });
    const location = response.headers()["location"];
    expect(location).toBeTruthy();

    const url = new URL(location);
    expect(url.origin + url.pathname).toBe("https://lichess.org/oauth");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("state")).toBeTruthy();
    // Zero scopes requested — US-A2's minimal-scope requirement.
    expect(url.searchParams.get("scope")).toBeNull();
    // The verifier must never appear in a URL the browser follows.
    expect(url.searchParams.get("code_verifier")).toBeNull();
  });

  test("issues a fresh state on every attempt", async ({ page }) => {
    const stateOf = async () => {
      const r = await page.request.get("/api/auth/login", { maxRedirects: 0 });
      return new URL(r.headers()["location"]).searchParams.get("state");
    };
    expect(await stateOf()).not.toBe(await stateOf());
  });

  test("refuses an off-site redirect_to", async ({ page }) => {
    // An open redirect here would let a phishing link bounce a freshly
    // authenticated user to an attacker's page.
    const response = await page.request.get("/api/auth/login?redirect_to=https://evil.example", {
      maxRedirects: 0,
    });
    expect(response.headers()["location"]).toContain("lichess.org");
  });
});

test.describe("callback rejects bad input", () => {
  test("missing parameters", async ({ page }) => {
    const response = await page.request.get("/api/auth/callback", { maxRedirects: 0 });
    expect(response.headers()["location"]).toContain("error=missing_parameters");
  });

  test("unknown state cannot be redeemed", async ({ page }) => {
    // Replay protection: a state we never issued must not open a session.
    const response = await page.request.get("/api/auth/callback?code=x&state=never-issued", {
      maxRedirects: 0,
    });
    expect(response.headers()["location"]).toContain("error=expired_or_replayed");
  });

  test("a declined consent screen is not treated as an error", async ({ page }) => {
    const response = await page.request.get("/api/auth/callback?error=access_denied", {
      maxRedirects: 0,
    });
    expect(response.headers()["location"]).toContain("declined=1");
  });
});

test.describe("signed-in access", () => {
  test("a seeded session reaches the games page", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    await page.goto("/games");
    await expect(page).toHaveURL(/\/games/);
    await expect(page.getByText(`Signed in as ${seed.lichessName}`)).toBeVisible();
  });

  test("an unknown session id is treated as signed out", async ({ browser, baseURL }) => {
    const context = await browser.newContext();
    await context.addCookies([
      { name: "ccai_session", value: "not-a-real-session", url: baseURL! },
    ]);
    const page = await context.newPage();
    await page.goto("/games");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test("logout invalidates the session server-side, not just the cookie", async ({
    browser,
    baseURL,
  }) => {
    // A dedicated session — logging out deletes the row, and sharing the main
    // session would sign out every spec running in parallel.
    const context = await browser.newContext();
    await context.addCookies([
      { name: "ccai_session", value: seed.logoutSessionId, url: baseURL! },
    ]);
    const page = await context.newPage();

    await page.goto("/account");
    await expect(page).toHaveURL(/\/account/);

    await page.request.post("/api/auth/logout");

    // Re-attach the SAME cookie value. If logout only cleared the cookie, this
    // would still work — the session must be gone from the database.
    await context.addCookies([
      { name: "ccai_session", value: seed.logoutSessionId, url: baseURL! },
    ]);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login/);

    await context.close();
  });
});

test.describe("login page", () => {
  test("states that no permissions are requested", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText(/no permissions at all/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /continue with lichess/i })).toBeVisible();
  });

  test("renders a friendly message for each error code", async ({ page }) => {
    await page.goto("/login?error=expired_or_replayed");
    // Next's route announcer also has role="alert", so scope to ours.
    const alert = page.locator('p[role="alert"]');
    await expect(alert).toBeVisible();
    // No internal identifiers leaked to the user.
    await expect(alert).not.toContainText("expired_or_replayed");
  });
});
