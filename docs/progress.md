# Progress

The **single** tracker for this repo (docs-placement rule — never create `STATUS.md`, `TODO.md`,
`PLAN.md`, or dated status files). Updated via the `/progress` skill. Requirements live in
[`prd.md`](prd.md); the build order lives in [`implementation-plan.md`](implementation-plan.md);
choices live in [`decisions.md`](decisions.md).

**Current phase:** P0 — validation demo · **Current milestone:** M1 done, M2 next
**Last updated:** 2026-07-28

States: `not started` · `in progress` · `blocked (reason)` · `done (verified how)` · `deferred (to milestone)`.
"Done" requires verification — a passing test, a working page, a measured number. Code that exists
but was never run is `in progress`.

---

## Phase 0 — Claude Code & repo tooling · **done**

| Item                                                                           | State       | Verified                                                                                                                  |
| ------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md` — project map                                                      | done        | 2026-07-28 · reviewed against reference setup                                                                             |
| `docs/prd.md` — requirements                                                   | done        | 2026-07-28 · authority doc, verbatim from product                                                                         |
| `docs/implementation-plan.md` — research + milestones                          | done        | 2026-07-28 · library/licensing research with sources                                                                      |
| `.claude/rules/` — 2 always-on + 5 path-scoped                                 | done        | 2026-07-28 · front-matter paths checked                                                                                   |
| `.claude/agents/` — architect, engine, backend, frontend, reviewer             | done        | 2026-07-28 · registered by the harness                                                                                    |
| `.claude/skills/` — story, fairplay-check, spec-check, progress, **skeletons** | done        | 2026-07-28 · registered by the harness; `/skeletons` added per D-08                                                       |
| `.claude/hooks/` — hard-rules, secrets, format, stop-typecheck                 | done        | 2026-07-28 · **15/15 payload tests pass**                                                                                 |
| `.claude/settings.json`, `.mcp.json`                                           | done        | 2026-07-28 · valid JSON, hooks resolve, no secrets; MCP = context7 + playwright (360×800 default)                         |
| `docs/progress.md`, `docs/decisions.md`                                        | done        | 2026-07-28 · 7 decisions recorded, 7 open questions                                                                       |
| `docs/attribution.md` — GPL/asset notices                                      | in progress | Skeleton written; Stockfish source-offer URL and cburnett licence are **launch blockers** (NFR-L3/L2), filled in at M3/M5 |

---

## P0 — validation demo

### M1 · Scaffold & infra — **done** (2026-07-28)

| Acceptance item                           | State | Verified how                                                                                                                                 |
| ----------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js 16 App Router + TypeScript        | done  | `npm run build` succeeds; 2 static routes generated                                                                                          |
| ESLint + Prettier                         | done  | `npm run lint` clean; `npm run format:check` clean                                                                                           |
| Vitest                                    | done  | 5 unit tests pass (threading feature detection)                                                                                              |
| **COOP/COEP headers (FR-7)**              | done  | `next.config.ts` + `public/_headers`; smoke test green against **both** `next start` **and** the real Cloudflare Worker under `wrangler dev` |
| Single-thread fallback detection (NFR-C1) | done  | `src/lib/cross-origin-isolation.ts` + 5 tests incl. isolated-but-no-SAB and constructor-throws cases                                         |
| CI (typecheck · lint · format · test)     | done  | `.github/workflows/ci.yml` — 3 jobs incl. hard-rule guardrails mirroring the write-time hook                                                 |
| Deploy pipeline                           | done  | `.github/workflows/deploy.yml` — skips cleanly until `CLOUDFLARE_API_TOKEN` is set                                                           |
| Hosting target                            | done  | Cloudflare Workers via OpenNext (D-05) — **changed from Vercel** per user directive                                                          |

**Deferred from M1, deliberately:**

- **Browser-level assertion that `crossOriginIsolated === true`** — the HTTP headers that cause it
  are asserted at both layers, and `/` renders the live value, but no browser reads it yet.
  Unblocked by D-08: the Playwright MCP is now configured, so this can be asserted directly from
  **M2** onward rather than waiting for M3.
- **Vercel EU region** → replaced by Cloudflare (D-05). EU data residency is now **O-8**, open, and
  must be settled before P1 stores personal data.
- **NFR-P1 (TTI < 3 s on 4G)** — not measurable against a placeholder page; measured at M5 when the
  report UI exists.

### Remaining P0 milestones

| Milestone                    | Stories                         | State       | Notes                                                                                                                                                        |
| ---------------------------- | ------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **M2 · Lichess import**      | US-A1 (partial), US-B1, FR-2    | not started | ← **next.** Public export by username, NDJSON, normalize to internal model, friendly errors, 429 backoff                                                     |
| **M3 · Engine analysis**     | US-C1, US-C2                    | not started | Stockfish WASM in Worker, depth ≥18/1M nodes, progress+cancel, IndexedDB cache, single-thread fallback, eval provenance                                      |
| **M4 · Move classification** | US-C4                           | not started | Win-probability deltas, clean-room, original names/icons, ≥50 fixtures CI-gated                                                                              |
| **M5 · Report UI**           | US-G1, US-D2                    | not started | **Mobile-first** board + move list + eval graph + badges + key moments; paired skeletons per `/skeletons`; verified at 360 px via Playwright MCP; CLS ≤ 0.05 |
| **M6 · AI summary**          | US-D1, FR-4                     | not started | Structured payload → LLM → **grounding validator** → ≤250 words; engine-only degradation                                                                     |
| **M7 · Launch hardening**    | US-A1, FR-6, NFR-PR2, NFR-L2/L3 | not started | 3 reports/IP/day server-side, email capture + consent, funnel telemetry, privacy/ToS, attribution page, ≤60 s p75                                            |

## P1 — MVP (outline)

`US-A2` Lichess OAuth+PKCE · `US-B1/B3` game list + filters · `US-D3` recommendations ·
`US-E1/E2` weakness dashboard · `US-F1–F3` billing + entitlements · `US-A4` GDPR delete/export.
All `not started`.

---

## Blockers & open questions

M2 can start immediately. The questions below block later milestones — see `decisions.md` for the
full list and recommendations.

| #   | Question                                  | Blocks                            |
| --- | ----------------------------------------- | --------------------------------- |
| O-2 | Brand name + domain                       | OAuth registration, `User-Agent`  |
| O-3 | Default LLM provider + model              | M6                                |
| O-4 | P0 scope: Lichess-only or chess.com too?  | M2 scope (recommend Lichess-only) |
| O-8 | EU data residency on Cloudflare (NFR-PR1) | P1, before storing personal data  |

Resolved: **O-1** stack sign-off → D-07 (Cloudflare per D-05).
Deferred by design: O-5 Paddle vs Stripe, O-6 pricing, O-7 free-tier engine cap — all P1.
