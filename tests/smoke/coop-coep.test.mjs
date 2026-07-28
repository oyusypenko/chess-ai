/**
 * FR-7 smoke test — cross-origin isolation headers.
 *
 * Asserts the real HTTP response carries the headers that make
 * `crossOriginIsolated === true` in the browser. Unit-testing the next.config
 * object would only prove we wrote a config; this proves a server actually
 * serves it.
 *
 * Why this gates CI: without these headers `SharedArrayBuffer` is unavailable,
 * multithreaded Stockfish silently falls back to the single-threaded build, and
 * analysis just gets slower (US-C1, NFR-C1). It degrades with no error — nobody
 * notices until someone measures.
 *
 * Two modes:
 *   npm run test:headers
 *       Builds nothing; boots `next start` (needs a prior `npm run build`).
 *       Fast CI gate — proves next.config is correct.
 *   SMOKE_BASE_URL=https://… npm run test:headers
 *       Tests an already-running target instead. Use against `npm run preview`
 *       (the real Worker via wrangler) or a deployed URL — this is the only
 *       mode that proves *Cloudflare* serves the headers, since the Worker and
 *       the static-asset layer are separate paths (see public/_headers).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const EXTERNAL = process.env.SMOKE_BASE_URL;
const PORT = process.env.SMOKE_PORT ?? "3123";
const BASE = EXTERNAL ?? `http://127.0.0.1:${PORT}`;
const STARTUP_TIMEOUT_MS = 60_000;

let server;

before(async () => {
  if (EXTERNAL) return; // caller owns the target

  server = spawn("npx", ["next", "start", "--port", PORT], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production" },
  });

  let stderr = "";
  server.stderr.on("data", (d) => (stderr += d));

  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  for (;;) {
    if (Date.now() > deadline) {
      throw new Error(
        `server did not start within ${STARTUP_TIMEOUT_MS}ms.\n` +
          `Did you run \`npm run build\` first?\nstderr:\n${stderr}`,
      );
    }
    try {
      await fetch(BASE, { signal: AbortSignal.timeout(1000) });
      break;
    } catch {
      await sleep(300);
    }
  }
});

after(() => server?.kill("SIGTERM"));

test("document is served with cross-origin isolation headers (FR-7)", async () => {
  const res = await fetch(BASE);
  assert.equal(res.status, 200);

  assert.equal(
    res.headers.get("cross-origin-opener-policy"),
    "same-origin",
    "COOP must be `same-origin` or the browser will not isolate the document",
  );
  assert.equal(
    res.headers.get("cross-origin-embedder-policy"),
    "require-corp",
    "COEP must be `require-corp` or SharedArrayBuffer stays unavailable",
  );
});

test("isolation headers apply to nested routes, not just `/`", async () => {
  // A route added later must not silently lose isolation — the engine page
  // will not live at `/`.
  const res = await fetch(`${BASE}/does-not-exist`);
  assert.equal(
    res.headers.get("cross-origin-opener-policy"),
    "same-origin",
    "COOP missing on a nested path — check the `source` pattern in next.config",
  );
  assert.equal(
    res.headers.get("cross-origin-embedder-policy"),
    "require-corp",
    "COEP missing on a nested path — check the `source` pattern in next.config",
  );
});

test("baseline security headers are present (NFR-S2)", async () => {
  const res = await fetch(BASE);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("referrer-policy"), "origin-when-cross-origin");
});
