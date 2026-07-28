import { describe, it, expect, afterEach, vi } from "vitest";
import { detectEngineThreadingSupport } from "./cross-origin-isolation";

/**
 * Unit coverage for the threading feature detection (US-C1, NFR-C1).
 * The HTTP-level header guarantee is covered separately by
 * tests/smoke/coop-coep.test.mjs (FR-7).
 */
describe("detectEngineThreadingSupport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports no threading during SSR (no window)", () => {
    vi.stubGlobal("window", undefined);
    expect(detectEngineThreadingSupport()).toEqual({
      crossOriginIsolated: false,
      sharedArrayBuffer: false,
      threaded: false,
    });
  });

  it("enables threading when isolated and SharedArrayBuffer works", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("crossOriginIsolated", true);
    vi.stubGlobal(
      "SharedArrayBuffer",
      class {
        byteLength: number;
        constructor(n: number) {
          this.byteLength = n;
        }
      },
    );
    expect(detectEngineThreadingSupport().threaded).toBe(true);
  });

  it("falls back when the document is not isolated (headers missing)", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("crossOriginIsolated", false);
    vi.stubGlobal(
      "SharedArrayBuffer",
      class {
        byteLength = 1;
      },
    );
    const support = detectEngineThreadingSupport();
    expect(support.threaded).toBe(false);
    expect(support.crossOriginIsolated).toBe(false);
  });

  it("falls back when SharedArrayBuffer is absent despite isolation", () => {
    // Real case: some embedded webviews and older Safari.
    vi.stubGlobal("window", {});
    vi.stubGlobal("crossOriginIsolated", true);
    vi.stubGlobal("SharedArrayBuffer", undefined);
    const support = detectEngineThreadingSupport();
    expect(support.threaded).toBe(false);
    expect(support.sharedArrayBuffer).toBe(false);
  });

  it("falls back when the SharedArrayBuffer constructor throws", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("crossOriginIsolated", true);
    vi.stubGlobal(
      "SharedArrayBuffer",
      class {
        constructor() {
          throw new Error("blocked by policy");
        }
      },
    );
    expect(detectEngineThreadingSupport().threaded).toBe(false);
  });
});
