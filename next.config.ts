import type { NextConfig } from "next";

/**
 * Cross-origin isolation headers (FR-7).
 *
 * Stockfish NNUE runs multithreaded in a Web Worker, which needs
 * `SharedArrayBuffer`, which the browser only exposes when the document is
 * cross-origin isolated — i.e. `crossOriginIsolated === true`. That requires
 * BOTH headers below on the top-level document. Without them the engine
 * silently falls back to the single-threaded build and analysis gets slower
 * (US-C1, NFR-C1) — it degrades rather than errors, which is exactly why this
 * is covered by an automated smoke test (`tests/smoke/coop-coep.test.mjs`)
 * instead of being left to manual checking.
 *
 * ⚠️ COEP `require-corp` blocks any cross-origin subresource that does not opt
 * in via CORP/CORS. Self-host assets, or serve them with
 * `Cross-Origin-Resource-Policy: cross-origin`. Adding a third-party script or
 * font without that header will break the page, not just the engine.
 *
 * Do not change these values without re-running `npm run test:headers`.
 *
 * Ref: https://web.dev/articles/coop-coep
 */
export const CROSS_ORIGIN_ISOLATION_HEADERS = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
] as const;

/** Baseline security headers (NFR-S2 — OWASP hygiene). */
export const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
] as const;

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Every route: the engine page needs isolation, and applying it
        // globally avoids a class of bug where a new route silently loses it.
        // `public/_headers` mirrors this for assets served directly by
        // Cloudflare's asset layer, which bypasses the Worker.
        source: "/:path*",
        headers: [...CROSS_ORIGIN_ISOLATION_HEADERS, ...SECURITY_HEADERS],
      },
    ];
  },
};

export default nextConfig;

// Makes Cloudflare bindings available during `next dev`, so local development
// behaves like the deployed Worker instead of diverging from it.
//
// Loaded lazily and only in development, for a reason worth stating: this
// package is a **devDependency**. A static import makes the whole config fail
// to load in any runtime that prunes dev dependencies (`npm ci --omit=dev`,
// which is exactly what the production Docker stage does). The config failing
// to load means COOP/COEP are never applied — FR-7 silently gone, with the
// engine dropping to single-threaded and nothing reporting an error.
//
// Not awaited: Next loads this config through `require()`, which cannot handle
// a top-level await. The `.catch` keeps a missing package from being fatal.
if (process.env.NODE_ENV === "development") {
  import("@opennextjs/cloudflare")
    .then(({ initOpenNextCloudflareForDev }) => initOpenNextCloudflareForDev())
    .catch(() => {
      // Cloudflare tooling absent — fine, dev still works without bindings.
    });
}
