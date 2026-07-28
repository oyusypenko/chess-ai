import { test, expect, seed } from "../e2e/fixtures";

/**
 * Email + password authentication, end to end (US-A2, US-A4, NFR-S1).
 *
 * These drive the real form and the real endpoints. Nothing is mocked: a
 * regression in hashing, throttling, or session handling fails here.
 */

/** Each registration needs a fresh address, and no clock is available in-page. */
function uniqueEmail(label: string): string {
  return `e2e.${label}.${Math.random().toString(36).slice(2, 10)}@example.com`;
}

const GOOD_PASSWORD = "a-perfectly-fine-passphrase";

test.describe("registration", () => {
  test("creates an account and signs the user straight in", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Email").fill(uniqueEmail("signup"));
    await page.getByLabel("Password", { exact: true }).fill(GOOD_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    // Making someone re-enter the password they just chose is friction with no
    // security value, so registration opens a session.
    await expect(page).toHaveURL(/\/account/);
    await expect(page.locator("header").getByRole("link", { name: "Sign in" })).toHaveCount(0);
  });

  test("rejects a password below the minimum length", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Email").fill(uniqueEmail("short"));
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByTestId("credentials-error")).toContainText(/at least 10 characters/i);
    await expect(page).toHaveURL(/\/register/);
  });

  test("rejects a password that is just the email address", async ({ page }) => {
    const email = uniqueEmail("selfpass");
    await page.goto("/register");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByTestId("credentials-error")).toContainText(/can't be your email/i);
  });

  test("rejects a malformed address", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Email").fill("not-an-address");
    await page.getByLabel("Password", { exact: true }).fill(GOOD_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByTestId("credentials-error")).toContainText(/email address/i);
  });

  test("says plainly when the address is already taken", async ({ page }) => {
    // Enumeration is accepted on *signup* — a signup form that hides this
    // cannot be used at all. The sign-in form makes the opposite trade.
    await page.goto("/register");
    await page.getByLabel("Email").fill(seed.password.email);
    await page.getByLabel("Password", { exact: true }).fill(GOOD_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByTestId("credentials-error")).toContainText(/already exists/i);
  });
});

test.describe("sign-in", () => {
  test("signs in with correct credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(seed.password.email);
    await page.getByLabel("Password", { exact: true }).fill(seed.password.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/games/);
  });

  test("honours the redirect the user was sent from", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel("Email").fill(seed.password.email);
    await page.getByLabel("Password", { exact: true }).fill(seed.password.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("gives the SAME message for a wrong password and an unknown account", async ({ page }) => {
    // Any difference between these two turns the form into an
    // account-enumeration oracle.
    const messages: string[] = [];

    for (const [email, password] of [
      [seed.password.email, "definitely-the-wrong-password"],
      ["nobody-here-at-all@example.com", "definitely-the-wrong-password"],
    ]) {
      await page.goto("/login");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in" }).click();
      messages.push((await page.getByTestId("credentials-error").textContent()) ?? "");
    }

    expect(messages[0]).toBe(messages[1]);
    expect(messages[0]).toMatch(/incorrect/i);
  });

  test("refuses an OAuth-only account with no password set", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("seeduser@example.com");
    await page.getByLabel("Password", { exact: true }).fill(GOOD_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByTestId("credentials-error")).toContainText(/incorrect/i);
  });

  test("never puts the password in the URL", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(seed.password.email);
    await page.getByLabel("Password", { exact: true }).fill(seed.password.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/games/);

    // A GET form would put the password in history, logs, and the Referer header.
    expect(page.url()).not.toContain(seed.password.password);
  });

  test("issues an httpOnly session cookie carrying no user data", async ({ page, context }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(seed.password.email);
    await page.getByLabel("Password", { exact: true }).fill(seed.password.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/games/);

    const cookie = (await context.cookies()).find((c) => c.name === "ccai_session");
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("Lax");
    // Opaque: the cookie must not carry the user id, the email, or anything
    // else that would make it a credential we cannot revoke.
    expect(cookie!.value).not.toContain(seed.password.userId);
    expect(cookie!.value).not.toContain("@");
    expect(cookie!.value).toMatch(/^[0-9a-f]{64}$/);

    // And script cannot read it.
    expect(await page.evaluate(() => document.cookie)).not.toContain("ccai_session");
  });
});

test.describe("throttling (NFR-S1)", () => {
  test("locks out after repeated failures on one address", async ({ request }) => {
    // A dedicated address so this cannot lock out another spec's account.
    const email = uniqueEmail("throttle");
    let sawThrottle = false;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await request.post("/api/auth/signin", {
        data: { email, password: "wrong-password-attempt" },
      });
      if (response.status() === 429) {
        sawThrottle = true;
        // A client that is told to wait must be told how long.
        expect(Number(response.headers()["retry-after"])).toBeGreaterThan(0);
        break;
      }
      expect(response.status()).toBe(401);
    }

    expect(sawThrottle, "expected a 429 within 12 failed attempts").toBe(true);
  });
});

test.describe("session management (US-A4)", () => {
  test("lists the current session and marks it as this device", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    await page.goto("/account");

    const sessions = page.locator("section", {
      has: page.getByRole("heading", { name: /where you.re signed in/i }),
    });
    await expect(sessions.getByText("This device")).toBeVisible();
  });

  test("offers no sign-out button for the current session", async ({ signedIn }) => {
    // Revoking the session rendering the page would leave the user staring at a
    // page they are no longer signed in to.
    const page = await signedIn.newPage();
    await page.goto("/account");

    const current = page.locator("li", { has: page.getByText("This device") });
    await expect(current.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  });

  test("revoking a session ends it immediately for that device", async ({ browser, baseURL }) => {
    // Two contexts, one account: revoke from A, then prove B is signed out.
    const a = await browser.newContext();
    const b = await browser.newContext();
    const url = baseURL!;

    await a.addCookies([{ name: "ccai_session", value: seed.password.sessionId, url }]);
    const pageA = await a.newPage();

    // B signs in for real, creating a second session.
    const pageB = await b.newPage();
    await pageB.goto("/login");
    await pageB.getByLabel("Email").fill(seed.password.email);
    await pageB.getByLabel("Password", { exact: true }).fill(seed.password.password);
    await pageB.getByRole("button", { name: "Sign in" }).click();
    await expect(pageB).toHaveURL(/\/games/);

    await pageA.goto("/account");
    // Scoped to the sessions section: a bare `li` selector would happily match
    // a list item from anywhere else on the page.
    const sessions = pageA.locator("section", {
      has: pageA.getByRole("heading", { name: /where you.re signed in/i }),
    });
    await sessions
      .locator("li", { hasNot: pageA.getByText("This device") })
      .first()
      .getByRole("button", { name: "Sign out" })
      .click();

    // The point of server-side sessions: this takes effect on B's next request,
    // with no waiting for a token to expire.
    await pageB.goto("/account");
    await expect(pageB).toHaveURL(/\/login/);

    await a.close();
    await b.close();
  });

  test("refuses to revoke a session belonging to another account", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    const response = await page.request.post("/api/account/sessions", {
      data: { session_id: seed.password.sessionId },
    });
    // Session ids are unguessable, but that is not an authorization model.
    expect(response.status()).toBe(404);

    // And the victim's session still works.
    const victim = await page.request.get("/api/account/sessions", {
      headers: { cookie: `ccai_session=${seed.password.sessionId}` },
    });
    expect(victim.status()).toBe(200);
  });

  test("requires a session to list sessions", async ({ request }) => {
    expect((await request.get("/api/account/sessions")).status()).toBe(401);
    expect((await request.post("/api/account/sessions", { data: {} })).status()).toBe(401);
  });

  test("never returns another account's sessions", async ({ signedIn }) => {
    const page = await signedIn.newPage();
    const response = await page.request.get("/api/account/sessions");
    const data = (await response.json()) as { sessions: { id: string }[] };
    expect(data.sessions.some((s) => s.id === seed.password.sessionId)).toBe(false);
  });
});

test.describe("changing a password", () => {
  test("requires the current password and revokes other devices", async ({ browser }) => {
    // This test registers its own account rather than using a seeded one.
    //
    // Changing a password is a one-way change to the fixture it runs against,
    // and the mobile-360 and desktop-1280 projects share a single server and a
    // single database. A seeded account would work for whichever project got
    // there first and fail for the other, as a function of scheduling — the
    // worst kind of failure to chase.
    const email = uniqueEmail("changepw");
    const original = "the-original-passphrase";
    const replacement = "a-brand-new-passphrase-99";

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/register");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(original);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/account/);

    // A second device on the same account, so the revocation is observable.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto("/login");
    await otherPage.getByLabel("Email").fill(email);
    await otherPage.getByLabel("Password", { exact: true }).fill(original);
    await otherPage.getByRole("button", { name: "Sign in" }).click();
    await expect(otherPage).toHaveURL(/\/games/);

    await page.goto("/account");

    // Wrong current password is refused.
    await page.getByLabel("Current password").fill("not-the-current-password");
    await page.getByLabel("New password").fill(replacement);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText(/not your current password/i)).toBeVisible();

    // Correct current password succeeds.
    await page.getByLabel("Current password").fill(original);
    await page.getByLabel("New password").fill(replacement);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText(/password updated/i)).toBeVisible();

    // The other device is signed out — otherwise the change is cosmetic against
    // an attacker who already has a session.
    await otherPage.goto("/account");
    await expect(otherPage).toHaveURL(/\/login/);

    // The caller keeps their own session: signing someone out mid-way through
    // securing their account is how they abandon it half-done.
    await page.goto("/account");
    await expect(page).toHaveURL(/\/account/);

    // And the new password is the one that works now. Navigate to a clean
    // /login first: the revoked page landed on `/login?redirect_to=/account`,
    // and signing in there would honour that redirect rather than the default.
    await otherPage.goto("/login");
    await otherPage.getByLabel("Email").fill(email);
    await otherPage.getByLabel("Password", { exact: true }).fill(replacement);
    await otherPage.getByRole("button", { name: "Sign in" }).click();
    await expect(otherPage).toHaveURL(/\/games/);

    await context.close();
    await other.close();
  });
});

test.describe("account page for an email-only account", () => {
  test("offers to connect Lichess, since there is nothing to import without it", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext();
    await context.addCookies([
      { name: "ccai_session", value: seed.password.sessionId, url: baseURL! },
    ]);
    const page = await context.newPage();

    await page.goto("/account");
    await expect(page.getByText(seed.password.email)).toBeVisible();
    await expect(page.getByRole("link", { name: /connect lichess/i })).toBeVisible();

    await context.close();
  });

  test("refuses a game sync with a clear reason rather than a stack trace", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext();
    await context.addCookies([
      { name: "ccai_session", value: seed.password.sessionId, url: baseURL! },
    ]);

    const response = await context.request.post("/api/games/sync");
    expect(response.status()).toBe(409);
    expect((await response.json()).message).toMatch(/connect your lichess/i);

    await context.close();
  });
});
