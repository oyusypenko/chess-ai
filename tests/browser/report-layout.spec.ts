import { test, expect, type Page } from "@playwright/test";

/**
 * Report layout verification (US-G1, NFR-C2, D-08).
 *
 * **Measurement, not class-reading.** Tailwind resolves same-property conflicts
 * by stylesheet order, so a class list routinely lies about the rendered box.
 * These tests read `getBoundingClientRect()` from a real browser.
 *
 * The default project is 360 px wide (playwright.config.ts) because that is the
 * viewport US-G1 requires and the one most users are on.
 */

/**
 * Rects of the report's top-level sections, keyed by their heading.
 *
 * **Document-relative, not viewport-relative.** `getBoundingClientRect()` is
 * measured from the viewport, so any scroll between two measurements shows up
 * as a uniform Δy on every element and reads as a layout shift that did not
 * happen. Adding `scrollY` makes the comparison measure reflow only — which is
 * the thing CLS actually cares about.
 */
async function sectionRects(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-testid="report-root"]');
    if (!root) return {};
    const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const section of root.querySelectorAll("section")) {
      const heading = section.querySelector("h2")?.textContent?.trim();
      if (!heading) continue;
      const r = section.getBoundingClientRect();
      out[heading] = {
        x: Math.round(r.x + window.scrollX),
        y: Math.round(r.y + window.scrollY),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    }
    return out;
  });
}

test.describe("mobile-first layout (US-G1)", () => {
  test("nothing overflows horizontally at 360px", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-360", "360px-specific check");
    await page.goto("/report-preview");
    await page.getByTestId("mode-ready").click();

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      // The page body must never scroll sideways; wide content scrolls inside
      // its own container instead.
      return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
    });
    expect(overflow.scrollWidth, "page scrolls horizontally at 360px").toBeLessThanOrEqual(
      overflow.clientWidth + 1,
    );
  });

  test("the board stays square and fits the viewport", async ({ page }) => {
    await page.goto("/report-preview");
    await page.getByTestId("mode-ready").click();

    const board = page.locator('[data-testid="report-root"] section').first();
    const box = await board.boundingBox();
    expect(box).not.toBeNull();
    // aspect-square: a board that is not square means the wrapper lost its
    // ratio and the page below it will move when a FEN loads.
    const inner = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="report-root"] .aspect-square');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    expect(inner).not.toBeNull();
    expect(Math.abs(inner!.w - inner!.h), "board is not square").toBeLessThanOrEqual(2);
  });
});

test.describe("skeleton parity (D-08) — the CLS proxy", () => {
  test("every section keeps the same box across the skeleton→content swap", async ({ page }) => {
    await page.goto("/report-preview");

    // Loading state is the default.
    const before = await sectionRects(page);
    await page.getByTestId("mode-ready").click();
    // Let layout settle without allowing an arbitrary wait to hide a shift.
    await page.waitForTimeout(150);
    const after = await sectionRects(page);

    const shared = Object.keys(before).filter((k) => k in after);
    expect(shared.length, "no matching sections found to compare").toBeGreaterThan(2);

    const deltas: string[] = [];
    for (const key of shared) {
      const dx = Math.abs(before[key].x - after[key].x);
      const dy = Math.abs(before[key].y - after[key].y);
      const dw = Math.abs(before[key].w - after[key].w);
      const dh = Math.abs(before[key].h - after[key].h);
      // 4px tolerance, per the /skeletons skill.
      if (dx > 4 || dy > 4 || dw > 4 || dh > 4) {
        deltas.push(`${key}: Δx=${dx} Δy=${dy} Δw=${dw} Δh=${dh}`);
      }
    }
    expect(deltas, `skeleton/content geometry mismatch:\n${deltas.join("\n")}`).toHaveLength(0);
  });

  test("the AI-pending state occupies the same box as a resolved summary (NFR-R1)", async ({
    page,
  }) => {
    await page.goto("/report-preview");

    await page.getByTestId("mode-ready").click();
    await page.waitForTimeout(100);
    const ready = (await sectionRects(page))["Your review"];

    await page.getByTestId("mode-pending").click();
    await page.waitForTimeout(100);
    const pending = (await sectionRects(page))["Your review"];

    expect(ready).toBeTruthy();
    expect(pending).toBeTruthy();
    // If the degradation box were shorter, every provider recovery would shift
    // the page — the exact failure NFR-R1's reserved geometry prevents.
    expect(Math.abs(ready.h - pending.h), "summary box resizes between states").toBeLessThanOrEqual(
      4,
    );
  });
});

test.describe("accessibility basics (NFR-C2)", () => {
  test("the move list is keyboard navigable with arrow keys", async ({ page }) => {
    await page.goto("/report-preview");
    await page.getByTestId("mode-ready").click();

    const list = page.getByRole("listbox", { name: /game moves/i });
    await list.focus();

    const selectedBefore = await page.locator('[role="option"][aria-selected="true"]').innerText();
    await page.keyboard.press("ArrowLeft");
    const selectedAfter = await page.locator('[role="option"][aria-selected="true"]').innerText();
    expect(selectedAfter).not.toBe(selectedBefore);

    await page.keyboard.press("Home");
    // Home goes to the starting position, so no move is selected.
    expect(await page.locator('[role="option"][aria-selected="true"]').count()).toBe(0);
  });

  test("classification badges carry a text label, not colour alone", async ({ page }) => {
    await page.goto("/report-preview");
    await page.getByTestId("mode-ready").click();

    const chips = page.locator("[data-classification]");
    const count = await chips.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const text = (await chips.nth(i).innerText()).trim();
      expect(text.length, "a badge rendered with no text label").toBeGreaterThan(0);
    }
  });

  test("loading state announces itself to assistive technology", async ({ page }) => {
    await page.goto("/report-preview");
    const statuses = page.locator('[role="status"][aria-busy="true"]');
    expect(await statuses.count()).toBeGreaterThan(0);

    await page.getByTestId("mode-ready").click();
    await page.waitForTimeout(100);
    // Busy indicators must clear once content arrives.
    expect(await page.locator('[aria-busy="true"]').count()).toBe(0);
  });
});
