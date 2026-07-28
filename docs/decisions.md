# Decision log

Numbered, dated record of choices the authority docs left open. A decision recorded nowhere gets
re-litigated — if you chose between real options, it belongs here. Owned by `chess-architect`
(spec-authority rule).

Format: **D-nn · date · decision · alternatives weighed · why · status** (`decided` /
`provisional — needs user sign-off` / `open — owner named`).

---

### D-01 · 2026-07-28 · Board & chess-logic libraries: `chess.js` + `react-chessboard`

**Status:** decided
**Alternatives:** `chessground` + `chessops` (Lichess's own, the obvious first choice);
`@mdwebb/react-chess`; hand-rolled board.
**Why:** `chessground` and `chessops` are **GPL-3.0**. Bundling either would put our proprietary
frontend into derivative-work scope, violating NFR-L3 — this is the single highest-cost mistake
available in this project, and the obvious library choice is the trap. `chess.js` is BSD-2 and
`react-chessboard` is MIT; both are maintained and cover what US-G1 needs. Enforced by
`.claude/hooks/check-hard-rules.sh` at write time and `/fairplay-check` at review time.
**Consequence:** we don't get chessground's polish for free; board interaction work is ours.

### D-02 · 2026-07-28 · Engine build: `@lichess-org/stockfish-web`

**Status:** decided
**Alternatives:** `stockfish.js` (nmrugg, powers chess.com's in-browser engine, SF 18, five size
flavors); the old `lichess-org/stockfish.wasm`.
**Why:** actively maintained NNUE WASM builds used by lichess.org itself, bootstraps the emscripten
module and fetches NNUE files, and ships multiple builds so the single-threaded fallback (NFR-C1)
is a build choice rather than a port. The old `stockfish.wasm` is pre-NNUE and effectively
deprecated. `stockfish.js` stays the documented fallback if integration friction appears.
**Note:** GPLv3 — loaded as a separate runtime artifact over a `postMessage`/UCI boundary, never
linked (NFR-L3). Attribution + source offer required before launch.

### D-03 · 2026-07-28 · Classifier is a clean-room re-implementation

**Status:** decided
**Alternatives:** port WintrChess/freechess logic directly; use it as a dependency.
**Why:** WintrChess/freechess is GPL-3.0. US-C4 permits following the _methodology_
(win-probability deltas, category set) but the implementation must be ours. Thresholds live in one
documented constants module so the methodology stays explainable (US-E2) rather than a black box.
**Consequence:** the ≥50-position fixture suite is the spec, not a regression net — fixtures are
written before the behavior they pin.

### D-04 · 2026-07-28 · `docs/progress.md` is the single tracker

**Status:** decided
**Alternatives:** no tracker at all (the pattern used by the reference repo this setup is modeled
on, which forbids tracker files); per-milestone status files; issue tracker only.
**Why:** the user explicitly asked for a dedicated progress file. Constraining it to exactly one
file, with reconciliation against the repo built into the `/progress` skill, avoids the failure
mode that motivates the no-tracker rule elsewhere — a proliferation of stale, mutually
contradictory status docs.
**Consequence:** `docs-placement` rule forbids every other tracker filename; `/progress` verifies
the tracker against the actual repo instead of trusting it.

### D-05 · 2026-07-28 · Hosting: Cloudflare Workers via OpenNext (not Vercel)

**Status:** decided (user directive)
**Alternatives:** Vercel EU region (the original plan §2 proposal); Cloudflare Pages.
**Why:** user decision. Cloudflare Workers with [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare)
runs the Next.js server in a Worker; peer range `>=16.2.11` covers our Next 16.2.12.
**Consequences worth knowing:**

- **COOP/COEP now has two paths, not one** (FR-7). `next.config.ts` covers what the Worker renders;
  `public/_headers` covers assets served directly by Cloudflare's asset layer, which bypasses the
  Worker. Both are set, and the smoke test runs against `next start` _and_ the real Worker under
  `wrangler dev` — verified 2026-07-28.
- **EU data residency (NFR-PR1) is now an open question, not a setting.** Vercel had a region
  picker; Cloudflare is a global edge network. Achieving EU residency means R2/D1 jurisdiction
  hints and possibly the Data Localization Suite. Tracked as **O-8** — must be resolved before P1
  stores personal data.
- Node middleware is unsupported by the adapter; `export const runtime = "edge"` must not be used.

### D-06 · 2026-07-28 · Tailwind CSS v4 for styling

**Status:** decided
**Alternatives:** CSS Modules; vanilla-extract; plain CSS.
**Why:** it is the `create-next-app` default, MIT-licensed (no NFR-L3 concern), and M5 builds a
dense report UI (board, move list, eval graph, badges) where utility classes pay off. Adopting it
at scaffold time avoids a migration later.
**Consequence:** the 360 px responsive requirement (US-G1) and contrast requirements (NFR-C2) are
still ours to verify — Tailwind makes them expressible, not automatic.

### D-07 · 2026-07-28 · Stack sign-off (resolves O-1)

**Status:** decided (user directive: "complete m1", with hosting amended per D-05)
**Why:** the instruction to build M1 authorized the plan §2 stack. Recorded explicitly because O-1
formally blocked M1, and an implicit approval that is never written down gets re-litigated.
**Scope:** single Next.js App Router + TypeScript app; route handlers as the backend through P1;
Vitest for unit tests; Prettier + ESLint. Hosting is Cloudflare per D-05, **not** the Vercel EU
that plan §2 originally proposed.

### D-08 · 2026-07-28 · Mobile-first UI, skeleton loading states, Playwright-MCP verification

**Status:** decided (user directive)
**Alternatives:** responsive-but-desktop-first with `max-*:` overrides; spinners or `null` for
loading; verifying layout by reading class names.
**Why:** US-G1 already required 360 px support, but "responsive" and "mobile-first" are different
commitments — a desktop-first layout squeezed down shifts differently, usually worse, on the
viewport most of our users are actually on. And this product is unusually exposed to layout shift:
a report fills in across **four** stages (game metadata → engine evals → classifications → LLM
summary), which is precisely the burst pattern CLS scoring punishes hardest.
**What this binds us to:**

- Base classes target narrow screens; `sm:`/`md:`/`lg:` widen. 360 px is verified **first**.
- Loading states are **paired skeletons** with 1:1 geometry — never spinners or `null`. The
  `/skeletons` skill (adapted from the reference implementation in `feels`) is mandatory reading
  before writing one, and carries the chess-specific reservations: the board is `aspect-square`,
  the move list reserves a viewport rather than N rows, the eval graph is fixed-height from first
  paint, classification chips are fixed-size regardless of label length, and the "AI summary
  pending" degradation box must be the same height as the resolved summary (NFR-R1).
- **CLS target ≤ 0.05**, stricter than the 0.1 "good" threshold NFR-P1 inherits from Core Web
  Vitals.
- Verification is by **measurement in a real browser via the Playwright MCP**, not by reading
  class names — Tailwind resolves same-property conflicts by stylesheet order, so the class list
  routinely lies about the rendered box. The MCP server is pinned to a 360×800 viewport by default.

**Consequence:** this also closes the M1 gap where FR-7's browser-level `crossOriginIsolated`
assertion was deferred — Playwright MCP can make it directly once there is a page worth driving.

### D-09 · 2026-07-28 · One TypeScript service; no Python service, no RAG, no agent loop

**Status:** provisional — needs user sign-off
**Question raised:** should the LLM layer be a separate Python service, and how do RAG / evals /
agents fit?

**Decision: keep the request path entirely in TypeScript. Python is allowed only for offline work
that never serves a request.**

**Why not a Python service.** The runtime LLM work here is _one_ HTTP call with a JSON body — the
Anthropic TS SDK covers it completely, and no Python-only capability is involved. Meanwhile the
genuinely hard part of M6, the **grounding validator**, is chess logic: parse the model's SAN,
check legality in the actual position, compare against engine PVs. That needs `chess.js`, which is
already our source of truth for move legality (D-01). Re-implementing it with `python-chess` would
give us **two chess engines that can disagree**, on precisely the component whose entire job is
being right. A second service also means a second deploy target on Cloudflare, cross-service
latency inside a ≤ 60 s p75 budget (NFR-P2), and a distributed system built for a single API call.

**Why no RAG.** Our core principle is engine-first: the LLM narrates structured engine output and
never evaluates (US-D1). **The engine _is_ the retrieval step** — it produces the facts, they are
exact, and they are already in the prompt. There is no corpus whose absence causes a wrong answer.
Adding a vector store would introduce a second, fuzzier source of "truth" into a pipeline whose
defining constraint is that every claim be verifiable against the game. For motif explanations
(P2), a **curated deterministic map** (motif tag → vetted explanation) beats retrieval: free,
instant, no hallucination surface, and reviewable by a coach. Revisit only if a genuine corpus
appears (annotated master games for study recommendations, US-D3 extended).

**Why no agent loop.** Agentic loops earn their cost on open-ended, hard-to-specify tasks. Report
generation is a single well-specified transformation with a deterministic validator behind it. An
agent would add latency, nondeterminism, and unbounded token spend to something budgeted at
**≤ $0.02 per report** and required to be reproducible (`promptVersion` + `model` stored per
report, FR-4). The architecture deliberately denies the model agency; that is the safety property,
not a limitation to route around.

**Where Python _is_ the right tool — offline only, under `tools/`:**

- **Eval harness**: golden set of games → generate reports → score grounding, length, tone-by-
  rating-band, and cost. This is batch analysis, and the Python data stack is genuinely better at
  it. It reads the same fixture games the TS suite uses.
- Prompt/model experimentation and A/B scoring; threshold tuning for the classifier (M4) via
  statistical analysis over many games.

The rule that keeps this honest: **nothing under `tools/` may be imported by the app, and nothing
in the request path may call it.** If an eval finding needs to change runtime behaviour, it changes
a threshold or a prompt version in the TS code.

**Runtime LLM ops we _do_ build (M6):** provider abstraction (FR-4), prompt versioning stored per
report, the grounding validator as a hard gate, per-report cost telemetry, cheap model by default
with a premium tier behind a flag (FR-8), and the engine-only degradation path (NFR-R1).

---

## Open — need a decision from the user

These block work at the milestone named. Recorded here so they aren't silently assumed.

| #   | Question                                                                     | Blocks                                                | Recommendation                                                                                                                                                                                                     | Source            |
| --- | ---------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| O-9 | Sign off D-09: one TypeScript service, no Python service / RAG / agent loop? | M6 architecture                                       | Yes — the engine is the retrieval step, and splitting chess logic across two languages risks two implementations disagreeing on the grounding validator. Python stays for the offline eval harness under `tools/`. | D-09              |
| O-8 | EU data residency on Cloudflare (NFR-PR1)                                    | P1 (before storing personal data)                     | Investigate R2/D1 jurisdiction hints and the Data Localization Suite. Cloudflare is a global edge network — residency is a configuration exercise, not a region picker                                             | D-05              |
| O-2 | Brand name + domain                                                          | OAuth app registration, chess.com `User-Agent` string | —                                                                                                                                                                                                                  | PRD Q5            |
| O-3 | Default LLM provider + model                                                 | M6                                                    | Claude Haiku 4.5 (~$0.01/report, inside the $0.02 budget); premium tier Sonnet 5 behind a flag. Needs an EU DPA check (NFR-PR1)                                                                                    | PRD Q3, plan §1.5 |
| O-4 | P0 scope: Lichess-only or chess.com from day one?                            | M2                                                    | Lichess-only — chess.com needs the backend proxy (FR-1) earlier and adds no validation signal                                                                                                                      | PRD Q6            |
| O-5 | Billing: Paddle vs Stripe                                                    | P1 / US-F2                                            | Paddle — merchant-of-record offloads EU VAT                                                                                                                                                                        | PRD Q1            |
| O-6 | Pricing point and annual discount                                            | P1 / US-F2                                            | Placeholder $6.99/mo, $49/yr per PRD                                                                                                                                                                               | PRD Q2            |
| O-7 | Is engine-only analysis truly unlimited on free?                             | P1 / US-F1                                            | —                                                                                                                                                                                                                  | PRD Q4            |
