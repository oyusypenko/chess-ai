# Progress

The **single** tracker for this repo (docs-placement rule — never create `STATUS.md`, `TODO.md`,
`PLAN.md`, or dated status files). Updated via the `/progress` skill. Requirements live in
[`prd.md`](prd.md); the build order lives in [`implementation-plan.md`](implementation-plan.md);
choices live in [`decisions.md`](decisions.md).

**Current phase:** P0 — validation demo · **Current milestone:** Phase 0 complete, M1 not started
**Last updated:** 2026-07-28

States: `not started` · `in progress` · `blocked (reason)` · `done (verified how)` · `deferred (to milestone)`.
"Done" requires verification — a passing test, a working page, a measured number. Code that exists
but was never run is `in progress`.

---

## Phase 0 — Claude Code & repo tooling

| Item | State | Verified |
|---|---|---|
| `CLAUDE.md` — project map | done | 2026-07-28 · reviewed against reference setup |
| `docs/prd.md` — requirements | done | 2026-07-28 · authority doc, verbatim from product |
| `docs/implementation-plan.md` — research + milestones | done | 2026-07-28 · library/licensing research with sources |
| `.claude/rules/` — 2 always-on + 4 path-scoped | done | 2026-07-28 · front-matter paths checked |
| `.claude/agents/` — architect, engine, backend, frontend, reviewer | done | 2026-07-28 · registered by the harness |
| `.claude/skills/` — story, fairplay-check, spec-check, progress | done | 2026-07-28 · registered by the harness |
| `.claude/hooks/` — hard-rules, secrets, format, stop-typecheck | done | 2026-07-28 · **15/15 payload tests pass**; no-op cleanly with no toolchain |
| `.claude/settings.json` — permissions + hook wiring | done | 2026-07-28 · valid JSON, hooks resolve |
| `.mcp.json` — context7 | done | 2026-07-28 · committed, no secrets |
| `docs/progress.md`, `docs/decisions.md` | done | 2026-07-28 · this file + 4 decisions recorded, 7 open questions listed |
| `docs/attribution.md` — GPL/asset notices | in progress | Skeleton written; Stockfish source-offer URL, cburnett licence, and asset rows are **launch blockers** (NFR-L3/L2) filled in at M3/M5 |

**Awaiting user review.** ← current state

---

## P0 — validation demo

| Milestone | Stories | State | Notes |
|---|---|---|---|
| **M1 · Scaffold & infra** | FR-7, NFR-P1 | not started | Next.js+TS, lint/test, CI, COOP/COEP headers + `crossOriginIsolated` smoke test, Vercel EU. Unblocks the format + typecheck hooks. |
| **M2 · Lichess import** | US-A1 (partial), US-B1, FR-2 | not started | Public export by username, NDJSON, normalize to internal model, friendly errors, 429 backoff |
| **M3 · Engine analysis** | US-C1, US-C2 | not started | Stockfish WASM in Worker, depth ≥18/1M nodes, progress+cancel, IndexedDB cache, single-thread fallback, eval provenance |
| **M4 · Move classification** | US-C4 | not started | Win-probability deltas, clean-room, original names/icons, ≥50 fixtures CI-gated |
| **M5 · Report UI** | US-G1, US-D2 | not started | Board + move list + eval graph + badges + key moments, 360px, WCAG AA basics |
| **M6 · AI summary** | US-D1, FR-4 | not started | Structured payload → LLM → **grounding validator** → ≤250 words; engine-only degradation |
| **M7 · Launch hardening** | US-A1, FR-6, NFR-PR2, NFR-L2/L3 | not started | 3 reports/IP/day server-side, email capture + consent, funnel telemetry, privacy/ToS, attribution page, ≤60s p75 check |

## P1 — MVP (outline)

`US-A2` Lichess OAuth+PKCE · `US-B1/B3` game list + filters · `US-D3` recommendations ·
`US-E1/E2` weakness dashboard · `US-F1–F3` billing + entitlements · `US-A4` GDPR delete/export.
All `not started`.

---

## Blockers & open questions

Four decisions are needed from the user before M1 (plan §7). None block Phase 0 review.

| # | Question | Blocks | Source |
|---|---|---|---|
| 1 | Confirm stack: single Next.js app + Vercel-EU for P0? | M1 | plan §2 |
| 2 | Brand name + domain | OAuth app registration, chess.com `User-Agent` | PRD Q5 |
| 3 | Default LLM provider/model (proposal: Claude Haiku 4.5, ~$0.01/report) + DPA | M6 | PRD Q3 |
| 4 | P0 scope: Lichess-only (recommended) or chess.com too? | M2 scope | PRD Q6 |

Deferred by design: Paddle vs Stripe (P1, PRD Q1), pricing (P1, Q2), engine-only free cap (P1, Q4).
