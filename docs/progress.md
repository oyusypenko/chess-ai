# Progress

The **single** tracker for this repo (docs-placement rule — never create `STATUS.md`, `TODO.md`,
`PLAN.md`, or dated status files). Updated via the `/progress` skill. Requirements live in
[`prd.md`](prd.md); the build order lives in [`implementation-plan.md`](implementation-plan.md);
choices live in [`decisions.md`](decisions.md).

**Current phase:** P0 — validation demo · **Current milestone:** M1–M7 complete
**Last updated:** 2026-07-28

States: `not started` · `in progress` · `blocked (reason)` · `done (verified how)` · `deferred (to milestone)`.
"Done" requires verification — a passing test, a working page, a measured number. Code that exists
but was never run is `in progress`.

**Test totals:** 269 unit · 41 browser (360 px + 1280 px) · 3 HTTP smoke.

---

## Phase 0 — Claude Code & repo tooling · **done**

Rules, agents, skills, hooks, MCP, settings, and the docs set. Hooks verified with 15/15 payload
tests. Full inventory in [`implementation-plan.md`](implementation-plan.md) §3.

---

## P0 — validation demo · **complete**

| Milestone                    | State | Verified how                                                                                                                                                                |
| ---------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1 · Scaffold & infra**    | done  | Next.js 16 + TS + Tailwind; CI (validate/smoke/browser/guardrails); COOP/COEP on **two** paths (`next.config` + `_headers`), asserted over real HTTP and in-browser         |
| **M2 · Lichess import**      | done  | Real API: 136-move game with clocks, ECO opening, correct subject/colour/result, 136 `lichess-server` evals. 404 vs 400 paths confirmed distinct                            |
| **M3 · Engine analysis**     | done  | Browser-verified: `crossOriginIsolated`=true, 4 threads, **+25 cp** on a quiet Italian position at **depth 18 / 1,001,527 nodes in 551 ms** → ~23 s for a 40-move game      |
| **M4 · Move classification** | done  | 60+ CI-gated fixtures: both colours, exact boundaries, mate-vs-cp, promotion/castling/en-passant. Determinism proven. Found 2 real bugs (mate ranking, sacrifice detection) |
| **M5 · Report UI**           | done  | Mobile-first at 360 px. Skeleton↔content parity **0 px** on every section; measured **CLS 0.00000** via PerformanceObserver against a ≤ 0.05 target                         |
| **M6 · AI summary**          | done  | Grounding validator with adversarial fixtures; regenerate-once-then-strip; engine-only degradation. Hook-verified that provider SDKs cannot escape `src/llm/`               |
| **M7 · Launch hardening**    | done  | Live-server verified: 4th report/IP/day → **HTTP 429**; unfinished game → **400**; consent refused without a ticked box. Legal pages reachable from every page              |

### Extras beyond the plan

| Item                       | State | Notes                                                                                                                                                                                                |
| -------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docker (dev/prod/test/e2e) | done  | Container verified running: COOP/COEP served, non-root uid 1001, engine + GPL licence present. Found a real bug — a devDependency import in `next.config.ts` silently killed FR-7 under `--omit=dev` |
| Playwright browser suite   | done  | 41 tests; 360 px is the baseline project, not an extra (D-08)                                                                                                                                        |

---

## 🚩 Launch blockers — must clear before P0 goes public

Real obligations, not paperwork. None can be satisfied by code alone.

| #   | Blocker                                                                                                                                                                                                                  | Requirement    | Where                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ----------------------------------------------------- |
| 1   | **GPLv3 source offer is generic.** The attribution page points at upstream repos; it must resolve to the _exact_ sources for the binaries we serve (stockfish-web's patch + pinned Stockfish commit), or we mirror them. | NFR-L3         | `src/app/attribution/page.tsx`, `docs/attribution.md` |
| 2   | **Privacy policy and ToS are unreviewed drafts.** They describe the software accurately but name no data controller and no contact address, and no lawyer has read them. Flagged as drafts in the UI.                    | NFR-PR2        | `src/app/{privacy,terms}/page.tsx`                    |
| 3   | **Rate-limit store is in-memory.** Correct for one instance, wrong for a Worker fleet — the limit would reset per isolate. Needs Cloudflare KV or Durable Objects.                                                       | US-A1, US-F1   | `src/server/rate-limit.ts`                            |
| 4   | **Email store is in-memory.** Waitlist addresses do not survive a restart, and NFR-PR3 deletion has nothing durable to delete from.                                                                                      | US-A1, NFR-PR3 | `src/server/email-capture.ts`                         |
| 5   | **cburnett piece licence unverified.** We currently ship react-chessboard's defaults; if we adopt cburnett, verify the exact files' licence first.                                                                       | NFR-L2/L3      | `docs/attribution.md`                                 |
| 6   | **NFR-P1 not measured.** Landing TTI < 3 s on 4G mid-range mobile and Core Web Vitals "good" need a real Lighthouse run against a deployment.                                                                            | NFR-P1         | —                                                     |
| 7   | **`ANTHROPIC_API_KEY` not configured.** Without it every report degrades to engine-only — correct per NFR-R1, but not the intended launch experience.                                                                    | US-D1          | deploy env                                            |

## P1 — MVP · not started

`US-A2` Lichess OAuth+PKCE · `US-B1/B3` game list + filters · `US-D3` recommendations ·
`US-E1/E2` weakness dashboard · `US-F1–F3` billing + entitlements · `US-A4` GDPR delete/export.
See [`implementation-plan.md`](implementation-plan.md) §5.

---

## Open questions

| #   | Question                                    | Blocks                                      |
| --- | ------------------------------------------- | ------------------------------------------- |
| O-2 | Brand name + domain                         | OAuth registration, `User-Agent`            |
| O-3 | Default LLM model (proposal: Haiku 4.5)     | launch quality/cost                         |
| O-4 | P0 scope: Lichess-only or chess.com too?    | resolved in practice — Lichess-only shipped |
| O-8 | EU data residency on Cloudflare             | P1 persistence                              |
| O-9 | Sign off D-09 (no Python service/RAG/agent) | M6 architecture — as built                  |

Resolved: **O-1** stack sign-off → D-07. Deferred by design: O-5/6/7 (billing, pricing, free cap).
