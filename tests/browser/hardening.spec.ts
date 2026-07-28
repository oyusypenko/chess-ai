import { test, expect } from "@playwright/test";

/**
 * M7 launch-hardening checks (US-A1, FR-6, NFR-PR2, NFR-L3).
 *
 * These verify the obligations that are easy to believe are done and easy to
 * ship broken: the legal pages existing and being reachable, and consent being
 * genuinely required rather than merely displayed.
 */

test.describe("legal pages (NFR-PR2, NFR-L3)", () => {
  for (const [path, heading] of [
    ["/privacy", /privacy policy/i],
    ["/terms", /terms of service/i],
    ["/attribution", /open-source attribution/i],
  ] as const) {
    test(`${path} renders`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    });
  }

  test("the attribution page carries the GPLv3 source offer", async ({ page }) => {
    await page.goto("/attribution");
    // GPLv3 §6 obliges us to accompany the binaries with a written source
    // offer. Its absence is a licence violation, not a missing paragraph.
    await expect(page.getByText(/written offer of source code/i)).toBeVisible();
    await expect(page.getByText(/GNU General Public License/i).first()).toBeVisible();
  });

  test("legal links are reachable from every page", async ({ page }) => {
    for (const path of ["/", "/report-preview", "/privacy"]) {
      await page.goto(path);
      const footer = page.locator("footer");
      await expect(footer.getByRole("link", { name: /privacy/i })).toBeVisible();
      await expect(footer.getByRole("link", { name: /terms/i })).toBeVisible();
      await expect(footer.getByRole("link", { name: /attribution/i })).toBeVisible();
    }
  });
});

test.describe("waitlist consent (NFR-PR2)", () => {
  test("the consent box starts unticked — a pre-ticked box is not consent", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("checkbox")).not.toBeChecked();
  });

  test("submission is blocked until consent is actively given", async ({ page }) => {
    await page.goto("/");
    const submit = page.getByRole("button", { name: /notify me/i });
    await expect(submit).toBeDisabled();

    await page.getByRole("checkbox").check();
    await expect(submit).toBeEnabled();
  });

  test("the consent label links to the privacy policy", async ({ page }) => {
    await page.goto("/");
    const link = page.locator("label").getByRole("link", { name: /privacy policy/i });
    await expect(link).toHaveAttribute("href", "/privacy");
  });
});

test.describe("fair play is stated, not buried (NFR-L1)", () => {
  test("the landing page says post-game only", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/post-game only/i)).toBeVisible();
  });

  test("the terms state it plainly", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByRole("heading", { name: /post-game analysis only/i })).toBeVisible();
  });
});
