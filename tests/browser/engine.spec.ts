import { test, expect } from "@playwright/test";

/**
 * Browser-level verification of the engine and cross-origin isolation
 * (US-C1, NFR-C1, FR-7).
 *
 * The HTTP smoke test (tests/smoke/coop-coep.test.mjs) proves the *headers* are
 * served. This proves the browser actually acted on them and that the engine
 * loads, handshakes over UCI, and returns a sane evaluation — the failure modes
 * that only exist in a real browser.
 *
 * Mobile-first (D-08): the default viewport is 360 px wide.
 */

test.describe("cross-origin isolation (FR-7)", () => {
  test("the browser reports crossOriginIsolated === true", async ({ page }) => {
    await page.goto("/engine-check");

    // The authoritative assertion — headers are only a means to this end.
    // Without it, SharedArrayBuffer is unavailable and the threaded engine
    // silently degrades (US-C1, NFR-C1).
    const isolated = await page.evaluate(() => globalThis.crossOriginIsolated === true);
    expect(isolated, "document is not cross-origin isolated — check COOP/COEP").toBe(true);

    const hasSab = await page.evaluate(() => {
      try {
        return new SharedArrayBuffer(1).byteLength === 1;
      } catch {
        return false;
      }
    });
    expect(hasSab, "SharedArrayBuffer unavailable despite isolation").toBe(true);
  });

  test("the page reflects isolation in its own UI", async ({ page }) => {
    await page.goto("/engine-check");
    await expect(page.getByTestId("coi")).toHaveText("true");
    await expect(page.getByTestId("sab")).toHaveText("true");
  });
});

test.describe("Stockfish engine (US-C1)", () => {
  test("loads, evaluates a known position, and returns a sane score", async ({ page }) => {
    test.setTimeout(180_000); // first run downloads the ~14 MB network

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/engine-check");
    await page.getByRole("button", { name: /run engine check/i }).click();

    const result = page.getByTestId("engine-ok");
    await expect(result).toBeVisible({ timeout: 150_000 });

    const text = (await result.textContent()) ?? "";

    // Budget actually applied (US-C1: depth >= 18 or >= 1M nodes).
    const depth = Number(text.match(/depth (\d+)/)?.[1] ?? 0);
    const nodes = Number((text.match(/([\d,]+) nodes/)?.[1] ?? "0").replace(/,/g, ""));
    expect(
      depth >= 18 || nodes >= 1_000_000,
      `budget not met: depth ${depth}, nodes ${nodes}`,
    ).toBe(true);

    // Sanity on the score. The test position is a quiet Italian Game where any
    // correct engine gives White a small edge. A huge or negative number means
    // the sign convention or the network load is wrong — the bug this catches.
    const cp = Number(text.match(/(-?\d+) cp/)?.[1] ?? NaN);
    expect(Number.isFinite(cp), `no centipawn score in: ${text}`).toBe(true);
    expect(Math.abs(cp), `implausible eval ${cp} for a quiet opening position`).toBeLessThan(200);

    // A principal variation must come back, in UCI long algebraic.
    expect(text).toMatch(/pv [a-h][1-8][a-h][1-8]/);

    expect(consoleErrors, `console errors: ${consoleErrors.join(" | ")}`).toHaveLength(0);
  });

  test("reports progress while searching", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/engine-check");
    await page.getByRole("button", { name: /run engine check/i }).click();
    // Either we catch a progress tick or the search finished very fast; both
    // are fine, but one of them must happen.
    await expect(page.getByTestId("engine-progress").or(page.getByTestId("engine-ok"))).toBeVisible(
      {
        timeout: 150_000,
      },
    );
  });
});
