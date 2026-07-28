# ChessCoach AI — Implementation Plan

Status: Draft v0.1 · 2026-07-28 · Companion to [`prd.md`](prd.md)

This plan covers research findings, stack decisions, and a milestone breakdown for P0 (validation
demo) with an outline for P1 (MVP). Phase 0 is the Claude Code / repo tooling setup — done first so
every later change is built under the project's guardrails.

---

## 1. Research findings

### 1.1 Engine (US-C1)

| Option                              | Verdict                                                                                                                                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`@lichess-org/stockfish-web`**    | **Recommended.** Actively maintained WASM builds of current Stockfish (NNUE), used by lichess.org itself; bootstraps the emscripten module and auto-downloads NNUE files; multiple builds so we can ship a single-threaded fallback (NFR-C1). |
| `stockfish.js` (nmrugg)             | Solid alternative (powers chess.com's in-browser engine, SF 18, five size flavors incl. a "lite" single-threaded build). Keep as fallback if lichess builds cause integration friction.                                                       |
| `stockfish.wasm` (old lichess port) | Rejected — pre-NNUE (SF classical), effectively deprecated.                                                                                                                                                                                   |

Engine runs in a **Web Worker**, UCI protocol, per-position budget depth ≥ 18 or ≥ 1M nodes
(US-C1). Multithreading requires `crossOriginIsolated === true` → **COOP/COEP headers** (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) set in
`next.config` `headers()`; verified by an automated smoke test (FR-7). Feature-detect
`SharedArrayBuffer` and fall back to the single-threaded build.

### 1.2 Chess logic + board — licensing is the deciding factor ⚠️

NFR-L3 requires our proprietary code to stay out of GPL derivative-work scope. Stockfish is safe
(separate WASM artifact loaded at runtime), but **bundled frontend libraries are not**:

| Library                       | License         | Usable?                                                                   |
| ----------------------------- | --------------- | ------------------------------------------------------------------------- |
| `chessground` (lichess board) | **GPL-3.0**     | ❌ bundling it makes our frontend GPL. Avoid (also `chessops` — GPL-3.0). |
| `chess.js`                    | BSD-2-Clause    | ✅ **use for move validation / PGN / FEN**                                |
| `react-chessboard`            | MIT             | ✅ **use as the board component** (responsive, Next.js-friendly)          |
| cburnett piece set (SVGs)     | permissive/open | ✅ with attribution page (NFR-L2)                                         |

Same trap applies to the classifier reference: **WintrChess/freechess is GPL-3.0.** Per US-C4 we do
a **clean-room re-implementation** — take the _methodology_ (win-probability-delta thresholds,
categories), never copy code. Document our thresholds in the repo; CI-gate against ≥ 50 fixtures.

### 1.3 Lichess API (US-B1, FR-2)

- OAuth 2.0 Authorization Code + **PKCE** for login (P1); the P0 demo needs no auth — the game
  export endpoint is public for public games.
- Export: NDJSON streaming; request `evals`, `clocks`, `opening` where available (US-C2 reuses
  server evals with provenance tags).
- Rate limits: on **429 wait ≥ 60 s, one retry**, visible "rate-limited, retrying…" state. Max 8
  concurrent export streams per IP — we use 1.

### 1.4 chess.com Published-Data API (P2, FR-1)

No OAuth; monthly archives (JSON/PGN). Requires recognizable `User-Agent` with contact info;
serial requests per user; past months cached immutably. **Backend-proxy only** — never called from
the browser. Deferred to P2; nothing in P0/P1 blocks it (normalize all games to one internal model
from day one).

### 1.5 LLM provider (US-D1, FR-4)

Provider-agnostic interface (FR-4) with the prompt + model version stored on every report. Cost
budget ≤ $0.02/report:

- A full report payload is roughly 3–6K input tokens (FENs, classified moves, top-k lines, clocks)
  and ≤ 1K output tokens (250-word summary + key-moment blurbs + recommendations).
- **Default candidate: Claude Haiku 4.5** ($1/M input, $5/M output) → ~$0.01/report, inside
  budget. Premium tier (paid users, behind a flag): **Claude Sonnet 5**.
- Requirements regardless of provider: EU DPA (NFR-PR1), server-mediated calls only (US-F1), the
  prompt never asks the model to evaluate a position, **grounding validator** post-processes every
  generated sentence against the real game + PVs.

Final provider/model choice is PRD open question #3 — the abstraction makes it swappable.

### 1.6 Hosting

**Cloudflare Workers via [OpenNext](https://opennext.js.org/cloudflare)** (decided — D-05;
supersedes the Vercel proposal this section originally carried). `@opennextjs/cloudflare` runs the
Next.js server inside a Worker; its peer range `>=16.2.11` covers Next 16.2.12.

Two consequences the Vercel plan did not have:

- **COOP/COEP has two enforcement points, not one** (FR-7). `next.config.ts` covers Worker-rendered
  responses; `public/_headers` covers assets served directly by Cloudflare's asset layer, which
  bypasses the Worker. Both are set and both are smoke-tested.
- **EU residency is no longer a region setting.** Cloudflare is a global edge network, so NFR-PR1
  becomes a configuration exercise (R2/D1 jurisdiction hints, possibly the Data Localization
  Suite) rather than a dropdown. Open as **O-8**, must be resolved before P1 stores personal data.

Rate limiting and quota state still need server-side storage in P0 — Cloudflare KV or Durable
Objects are now the natural fit rather than Upstash Redis; decide at M7 when the limit lands.

---

## 2. Stack decision (**decided** — D-07)

> Signed off in `docs/decisions.md` D-07 and implemented in M1. Hosting is Cloudflare (D-05),
> superseding the Vercel line this section originally proposed.

- **One Next.js (App Router) + TypeScript app** for P0/P1. Route handlers serve as the backend
  (LLM proxy, rate limiting, email capture); a separate service is not needed until chess.com
  proxy volume / job queue justify it (P2, FR-5).
- **Chess:** `chess.js` (BSD) + `react-chessboard` (MIT) + cburnett pieces (attributed).
- **Engine:** `@lichess-org/stockfish-web` in a Web Worker; single-thread fallback build.
- **State/caching client-side:** analysis results cached in IndexedDB keyed by
  `gameId + engineVersion` (FR-3 idempotency, US-C1 "never re-analyze").
- **Server state:** Cloudflare KV or Durable Objects for IP rate limits (US-A1) and later free-tier
  quotas (US-F1) — decided at M7 when the first limit lands. A relational store (D1, or Postgres
  via Hyperdrive) arrives in P1 with accounts, subject to the O-8 residency answer.
- **LLM:** provider interface in `src/llm/`; Anthropic SDK first implementation (Haiku 4.5
  default), model + prompt version persisted with each report.
- **i18n:** strings externalized from the first component (NFR-C3) — `next-intl`.
- **Analytics:** privacy-respecting funnel events (FR-6) — Plausible or PostHog EU, consent-based.

---

## 3. Phase 0 — Claude Code & repo tooling ✅ **done**

Organized by intent (fact → CLAUDE.md · procedure → skill · isolated job → subagent · guarantee →
hook · external system → MCP · what's allowed → settings). Everything except personal overrides is
committed, so every contributor runs the same rules.

| Piece                   | File(s)                                                                                          | Purpose                                                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CLAUDE.md**           | `CLAUDE.md`                                                                                      | The map: product summary, the two company-ending rules, path→owner table, skills, phasing, MCP. Kept ≤ ~100 lines; depth lives in rules.                                                                                                                                   |
| **Rules — always on**   | `.claude/rules/{non-negotiables,spec-authority}.md`                                              | The six hard lines; docs-first + authority chain + traceability.                                                                                                                                                                                                           |
| **Rules — path-scoped** | `.claude/rules/{engine-and-classifier,llm-and-reports,external-apis,frontend,docs-placement}.md` | Load only with the files they govern. Keeps the always-on context small.                                                                                                                                                                                                   |
| **Skills**              | `.claude/skills/{story,fairplay-check,spec-check,progress,skeletons}/SKILL.md`                   | `/story US-XX` (ACs as definition of done) · `/fairplay-check` (NFR-L1/L2/L3 gate) · `/spec-check` (full requirement audit) · `/progress` (tracker, reconciled against the repo) · `/skeletons` (pixel-stable loading states, D-08).                                       |
| **Subagents**           | `.claude/agents/chess-{architect,engine,backend,frontend,reviewer}.md`                           | One owner per area; `chess-reviewer` is adversarial and fresh-context — it refutes, never fixes.                                                                                                                                                                           |
| **Hooks**               | `.claude/settings.json` + `.claude/hooks/*.sh`                                                   | `check-hard-rules` (blocks GPL deps, live-game surfaces, LLM-evaluates prompts, classifier nondeterminism, misplaced provider SDKs/keys — 15/15 payload tests) · `protect-secrets` (PreToolUse Bash) · `format` · `stop-typecheck`. All no-op cleanly without a toolchain. |
| **Permissions**         | `.claude/settings.json`                                                                          | `deny` reads of `.env*`/secrets/keys (NFR-S1) · `ask` on publish/deploy/merge · `allow` routine test/lint/git.                                                                                                                                                             |
| **MCP**                 | `.mcp.json`                                                                                      | **context7** (current library docs — the docs-first rule) · **playwright** (real-browser verification, pinned to a 360×800 viewport because the product is mobile-first).                                                                                                  |
| **Docs**                | `docs/{progress,decisions,attribution}.md`                                                       | Single tracker; numbered decision log; GPL/asset attribution (a launch blocker).                                                                                                                                                                                           |

---

## 4. P0 — validation demo (build order)

Each milestone lists deliverables, the design decisions that are not obvious, and its definition of
done. PRD acceptance criteria are authoritative; anything here that contradicts them is a bug in
this document.

**Convention for every milestone:** tests land with the code (fixtures first for anything
CI-gated), `/fairplay-check` runs on any diff touching analysis/import/deps/assets, and
`docs/progress.md` is updated in the same change.

---

### M1 · Scaffold & infra ✅ **done 2026-07-28**

Next.js 16 App Router + TypeScript + Tailwind v4; ESLint/Prettier/Vitest; CI (validate · smoke ·
guardrails); Cloudflare Workers via OpenNext (D-05).

**FR-7 is the reason this milestone exists.** COOP/COEP must hold on _two_ paths on Cloudflare —
`next.config.ts` for Worker-rendered responses and `public/_headers` for the static-asset layer
that bypasses the Worker. Both are set; the smoke test asserts them over real HTTP and accepts
`SMOKE_BASE_URL` so the same test runs against `next start`, a local Worker, or a deployment.
`src/lib/cross-origin-isolation.ts` feature-detects by _construction_ (a `SharedArrayBuffer`
constructor can exist and still throw), keeping the single-threaded path supported rather than an
error state.

**Deferred deliberately:** browser-level `crossOriginIsolated` assertion (unblocked by the
Playwright MCP, D-08 — do it in M2); NFR-P1 TTI measurement (needs a real page — M5).

---

### M2 · Lichess import — US-A1 (partial), US-B1, FR-2

Turn a username into a normalized, provably-finished game.

**Deliverables**

```
src/model/game.ts          // the boundary contract — see below
src/lichess/types.ts       // the subset of Lichess's shape we consume + FINISHED_STATUSES
src/lichess/errors.ts      // typed ImportError + user-safe copy per failure kind
src/lichess/client.ts      // NDJSON export, FR-2 rate-limit contract, finished-only
src/lichess/normalize.ts   // Lichess JSON → NormalizedGame (chess.js drives FEN/SAN/UCI)
src/app/api/import/route.ts // server route: validate → fetch → normalize
```

**Key design decisions**

- **`NormalizedGame.finished` is the literal `true`, not `boolean`.** NFR-L1 is the hardest line
  this product has, so it is enforced by the type system: a value not proven finished cannot be
  assigned to the model at all. Backed by an **allow-list** of terminal statuses — an unrecognized
  status fails closed rather than slipping through.
- **Evals are White-POV with `cp` and `mate` kept distinct.** Flattening mate into a large
  centipawn value breaks win-probability maths at the extremes (US-C4). A `perspective(color)`
  helper centralizes the sign flip — the single most common bug class in this domain.
- **FR-2 rate limiting is one wait and one retry, never a loop.** Lichess limits per IP; a tight
  retry loop gets the whole deployment blocked, not one user. `Retry-After` is honoured when longer
  than 60 s, never when shorter.
- **One malformed NDJSON line does not discard the export.** Skip the line, keep the rest; only a
  wholly unparseable body is an error.
- Normalization is separate from transport so shape bugs and network bugs are testable apart.

**Definition of done**

- Valid username → most recent finished game normalized, with clocks/opening/server evals when the
  platform has them (server evals tagged `lichess-server`, US-C2).
- Unknown user, zero finished games, 429, 5xx, network failure, malformed body → each maps to a
  distinct designed state with user-safe copy; none throws a stack trace (US-A1, NFR-R2).
- Unfinished games are refused even if the API returns them.
- Browser-level `crossOriginIsolated` assertion via Playwright MCP (carried from M1).

---

### M3 · Engine analysis — US-C1, US-C2

Run Stockfish in the browser and produce an eval for every position.

**Deliverables**

```
src/engine/worker.ts        // Web Worker host: loads the WASM build, speaks UCI
src/engine/uci.ts           // UCI command builder + `info` line parser (pure, unit-tested)
src/engine/protocol.ts      // typed messages across the postMessage boundary
src/analysis/analyze-game.ts// orchestration: per-position budget, progress, cancellation
src/analysis/cache.ts       // IndexedDB, keyed by gameId + engineVersion (FR-3)
public/engine/              // the Stockfish WASM artifact (GPLv3, arm's length)
```

**Key design decisions**

- **Budget is depth ≥ 18 OR ≥ 1M nodes, whichever lands first** (US-C1). Whole game (~40 moves)
  ≤ 45 s on 2020+ mid-range hardware; pipeline ≤ 60 s p75 (NFR-P2).
- **Skip positions that already have a `lichess-server` eval** (US-C2). On an analyzed Lichess
  game this can eliminate most engine work — the single biggest lever on the p75 budget.
- **Threads are optional, never assumed.** Feature-detect and load the single-threaded build
  otherwise (NFR-C1). Both paths must produce the same classifications at the same budget.
- **Cancellation must actually stop the worker**, not just ignore its results — an abandoned
  analysis competing for CPU is how the next one blows its budget.
- **Cache is keyed by `gameId + engineVersion`** so an engine upgrade invalidates correctly and
  re-opening a game never re-analyzes (US-C1, FR-3).
- GPLv3 boundary: loaded at runtime over `postMessage`/UCI, never linked (NFR-L3). Attribution and
  source offer must be accurate before launch.

**Definition of done**

- Every position gets an eval with recorded provenance.
- Per-move progress reported; cancel stops work; second analysis of the same game issues zero
  `go` commands.
- Threaded and single-threaded paths both produce identical labels at equal budget.
- Timing measured, not estimated, on both paths.

---

### M4 · Move classification — US-C4

Turn evals into labels a human can act on.

**Deliverables**

```
src/classifier/win-probability.ts // eval → win probability (documented model)
src/classifier/thresholds.ts      // ALL thresholds, with written rationale
src/classifier/classify.ts        // pure: (position, played, evals) → Classification
src/classifier/motifs.ts          // motif tags (fork, hanging piece, back-rank…) for US-D3
src/classifier/fixtures/          // ≥ 50 curated positions with expected labels
```

**Key design decisions**

- **Win-probability deltas, not raw centipawns** (US-C4). At ±900 cp a 200 cp swing barely changes
  the outcome; near 0 it decides the game. Centipawn thresholds mislabel both ends.
- **Deterministic and pure.** Same input → same label, always. No `Math.random`, no `Date.now`, no
  I/O, no engine re-query — hook-enforced in this directory.
- **Clean-room** (NFR-L3). WintrChess/freechess is GPL-3.0: methodology may be re-implemented from
  its description, code may never be copied.
- **Thresholds live in one module with written rationale.** US-E2 requires the methodology be
  explainable, not a black box, and a threshold nobody can justify cannot be defended to a user.
- **Original category names and icon set** (NFR-L2) — never chess.com's glyphs or badge branding.
- **Fixtures are the spec, not a regression net.** New behavior gets its fixture first; a threshold
  change that moves a fixture is a recorded decision.

**Definition of done**

- ≥ 50-position fixture suite green and CI-gated.
- Determinism proven (classify twice → byte-identical).
- Explicit coverage: promotion/underpromotion, castling, en passant, mate scores vs centipawns,
  stalemate/draws, and **both colors** — a black blunder is a positive delta from White's view.
- A delta exactly on a threshold lands in exactly one category.

---

### M5 · Report UI — US-G1, US-D2

The screen the whole product exists to render. **Mobile-first (D-08): 360 px is built and verified
first, not last.**

**Deliverables**

```
src/components/board/            // react-chessboard wrapper, arrows, orientation
src/components/move-list/        // synced list, keyboard ← →, classification badges
src/components/eval-graph/       // eval over the game, fixed height from first paint
src/components/key-moments/      // 3–5 cards: board thumb, played vs best, explanation
src/features/report/             // page composition + staged loading
*.skeleton.tsx + *-geometry.ts   // paired skeletons per the /skeletons skill
```

**Key design decisions**

- **A report fills in across four stages** (metadata → evals → classifications → summary). That is
  four layout-shift opportunities on one screen, several mid-viewport. Every stage boundary needs a
  geometry-exact skeleton; target **CLS ≤ 0.05**, stricter than the 0.1 "good" threshold.
- **Reserve by shape, not by content**: board is `aspect-square`; the move list reserves a
  _viewport_ of rows rather than N rows (N varies per game); the eval graph is fixed-height with
  the axis drawn and the line absent; classification chips are fixed-size regardless of label
  length, or the whole list reflows as labels resolve.
- **The "AI summary pending" box must be the same height as the resolved summary** (NFR-R1) — the
  degradation path must not resize when the real text lands.
- **Verification is measurement, not class-reading.** Tailwind resolves same-property conflicts by
  stylesheet order, so class lists routinely lie about the rendered box. Playwright MCP:
  screenshot + `getBoundingClientRect()` diff at 360 px first, then 768/1280.
- Accessibility is a requirement, not polish (NFR-C2): keyboard nav, visible focus, contrast, and
  badges that never encode meaning in colour alone.

**Definition of done**

- Board + move list + eval graph + badges + key moments, all working at 360 px.
- Rect-diff parity between skeleton and loaded states; measured swap CLS < 0.05.
- Keyboard navigation through the game; `prefers-reduced-motion` respected.
- All strings externalized (NFR-C3).

---

### M6 · AI summary — US-D1, FR-4

The only place a language model touches the product — and the place with the strictest guardrail.

**Deliverables**

```
src/llm/provider.ts        // the abstraction; provider SDKs live nowhere else (FR-4)
src/llm/providers/         // concrete implementations
src/llm/prompt/            // versioned prompt templates
src/llm/grounding.ts       // the validator — the hard gate
src/report/build-payload.ts// classified game → structured, engine-only LLM input
src/app/api/report/route.ts// server-mediated call, cost telemetry, degradation
```

**Key design decisions**

- **Engine-first, LLM-explains.** The prompt carries only structured engine output — FENs, played
  move, top-k engine moves with evals, deltas, phase, motif tags, ratings, clocks. The model
  narrates. It never evaluates, ranks, or judges a position. A prompt asking "is this move good?"
  is a bug the hard-rules hook blocks.
- **The grounding validator is a hard gate, not a nicety.** Every move and square in the generated
  text is checked against the real game and the engine PVs: mismatch → regenerate **once** → then
  strip the offending sentences. It needs _adversarial_ fixtures — plausible-but-illegal SAN, a
  real move from the wrong position, a move from a different game — not happy-path ones.
- **No RAG, no agent loop, no Python service** (D-09). The engine _is_ the retrieval step; an agent
  would add nondeterminism and unbounded spend to something budgeted at ≤ $0.02/report and required
  to be reproducible. Python is permitted only for the offline eval harness under `tools/`, which
  nothing in the request path may import.
- **Reproducibility**: `promptVersion` + `model` stored with every report (FR-4). A report you
  cannot regenerate is a report you cannot debug.
- **Degradation is mandatory** (NFR-R1): provider down → engine-only report renders with an
  "AI summary pending" retry state, in the same reserved geometry. Never a blank page.

**Definition of done**

- ≤ 250 words, tone adapted to rating band (< 1200 / 1200–1800 / > 1800).
- Grounding validator green against adversarial fixtures; no hallucinated move can render.
- Cost ≤ $0.02/report measured, not assumed.
- Provider outage produces the engine-only report, verified by a test.

---

### M7 · Launch hardening — US-A1, FR-6, NFR-PR2, NFR-L2/L3

**Deliverables & decisions**

- **Server-side rate limit: 3 reports per IP per day**, resetting 00:00 UTC (US-A1). Cloudflare KV
  or Durable Objects (D-05 moved us off Redis) — decide here, when the first limit lands.
  Client-side checks are cosmetic; the server is the authority.
- **Email capture with an explicit GDPR consent checkbox** — consent is stored with the address,
  not implied by submission.
- **Funnel telemetry** (FR-6): username submitted → analysis done → report viewed → email captured.
  Privacy-respecting, consent-based, no third-party ad trackers.
- **Privacy policy + ToS** (NFR-PR2) — required before launch, and again later for any store
  listing.
- **Attribution page** (NFR-L3/L2) — Stockfish GPLv3 notice **and a working source offer**, plus
  the piece-set licence. `docs/attribution.md` currently carries an unresolved item: the cburnett
  licence must be verified against the exact files we ship; if it would contaminate the bundle,
  choose a different open set.
- **≤ 60 s p75 end-to-end measured** on 2020+ mid-range hardware (NFR-P2), on both threading paths.

**Definition of done:** a stranger can enter a username and get a complete, grounded report; the
4th attempt that day is refused server-side; the legal pages exist and are accurate.

---

## 5. P1 — MVP

1. **Lichess OAuth (Authorization Code + PKCE)**, minimal read-only scopes, accounts keyed to the
   Lichess user ID, tokens encrypted at rest, graceful re-auth on revocation (US-A2). Persistence
   lands here — subject to the **O-8** EU-residency answer, which must be settled _before_ personal
   data is stored, not after.
2. **Game list** — last 20 finished games with date, opponent, rating, colour, result, time
   control, ECO opening, and an "analyzed" badge; filters by time control/colour/result (US-B1,
   US-B3).
3. **Report persistence** + "what to work on" (US-D3): ≤ 3 recommendations derived from this
   game's classified mistakes and motif tags, each linking to its supporting moment. No filler — if
   there is nothing specific to say, say less.
4. **Weakness dashboard** (US-E1, US-E2) — the retention feature. Aggregates over 25/50/100 games:
   accuracy trend, blunder rate by phase, results by opening/colour/time control, time-trouble
   correlation. **Minimum-sample rule: n < 10 shows "not enough games yet"**, never a misleading
   number. Loads ≤ 3 s from cached aggregates; recomputed by async jobs, never on view.
5. **Billing & entitlements** (US-F1–F3) — provider per O-5 (Paddle preferred as merchant-of-record
   for EU VAT). Webhooks drive entitlement state; failed payment → 7-day grace; all gated endpoints
   check server-side.
6. **GDPR** (US-A4) — deletion within 30 days with confirmation email; JSON/PGN export.

## 6. Testing & quality strategy

| Layer                | Tool                                   | Gate                                                |
| -------------------- | -------------------------------------- | --------------------------------------------------- |
| Unit / logic         | Vitest, colocated `*.test.ts`          | `npm test`, CI `validate`                           |
| Classifier fixtures  | Vitest over ≥ 50 curated positions     | CI-gated; fixtures written before behavior          |
| Grounding validator  | Vitest with **adversarial** fixtures   | CI-gated — the anti-hallucination gate              |
| HTTP contract (FR-7) | `node --test` smoke, real server       | CI `smoke`, against `next start` _and_ the Worker   |
| Browser / layout     | **Playwright MCP**, 360 px first       | Skeleton rect-diff, CLS < 0.05, a11y                |
| Hard rules           | `.claude/hooks` + CI `guardrails`      | Blocks GPL deps, live-game surfaces, nondeterminism |
| Licence audit        | `license-checker` over production deps | Re-run on every `package.json` change               |
| Offline LLM eval     | Python harness under `tools/` (D-09)   | Not in the request path; informs prompt versions    |

**Local mirror:** `npm run validate` = typecheck + lint + format + unit tests, the same four stages
CI runs.

## 7. Observability & operations

- **Structured logging** in route handlers with a request ID; never log usernames alongside
  emails, and never log LLM payloads verbatim (NFR-PR1).
- **Cost telemetry per report** — tokens in/out, model, prompt version. The ≤ $0.02 budget is a
  claim we must be able to check, and the first sign of a bad prompt change is cost, not quality.
- **Analysis timing** recorded per game on both threading paths, so NFR-P2 regressions surface
  before users report them.
- **Cloudflare Workers observability** is enabled in `wrangler.jsonc`.
- **Degradation is observable**: engine-only reports and rate-limit refusals are counted, not
  silent — a spike means the provider or a limit is misconfigured.

## 8. Risks

| Risk                                                 | Mitigation                                                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GPL contamination (chessground/chessops/WintrChess)  | MIT/BSD deps only; clean-room classifier; write-time hook + CI guardrail + `/fairplay-check` licence pass; full dependency audit recorded in `docs/attribution.md` |
| WASM threads unavailable (Safari, embedded webviews) | Single-thread fallback verified by construction-based feature detection; both paths must produce identical labels; expectations messaging, never an error          |
| ≤ 60 s p75 pipeline missed                           | Reuse Lichess server evals (US-C2) — the biggest lever; per-position budget rather than per-game; render the report incrementally so time-to-first-value is short  |
| **Staged rendering causes layout shift**             | Geometry-exact paired skeletons (D-08, `/skeletons`); measured with Playwright MCP at 360 px; CLS ≤ 0.05                                                           |
| LLM hallucinated moves reaching users                | Grounding validator as a hard gate (regenerate → strip), adversarial fixtures, engine-first prompt construction                                                    |
| Drift toward live-game assistance                    | `finished: true` literal type; finished-status allow-list that fails closed; write-time hook; CI guardrail; `/fairplay-check` §1 blocks merge unconditionally      |
| EU data residency unresolved on Cloudflare           | **O-8** — must be answered before P1 stores personal data; P0 stores no personal data beyond consented emails                                                      |
| cburnett piece-set licence unverified                | Flagged in `docs/attribution.md`; verify the exact shipped files, or pick another open set — an unverified licence does not ship                                   |

## 9. Open questions

Tracked with recommendations in [`decisions.md`](decisions.md). Blocking status:

| #       | Question                                                 | Blocks                                         |
| ------- | -------------------------------------------------------- | ---------------------------------------------- |
| O-2     | Brand name + domain                                      | OAuth app registration, chess.com `User-Agent` |
| O-3     | Default LLM provider + model (proposal: Haiku 4.5) + DPA | M6                                             |
| O-4     | P0 scope: Lichess-only or chess.com too?                 | M2 scope (recommend Lichess-only)              |
| O-8     | EU data residency on Cloudflare                          | P1 persistence                                 |
| O-9     | Sign-off on D-09 (no Python service / RAG / agent loop)  | M6 architecture                                |
| O-5/6/7 | Billing provider · pricing · free-tier engine cap        | P1                                             |

---

### Sources

- [stockfish-web (lichess-org)](https://github.com/lichess-org/stockfish-web) · [npm @lichess-org/stockfish-web](https://www.npmjs.com/package/@lichess-org/stockfish-web?activeTab=versions) · [stockfish.js (nmrugg)](https://github.com/nmrugg/stockfish.js/) · [UCI protocol](https://official-stockfish.github.io/docs/stockfish-wiki/UCI-&-Commands.html)
- [chess.js](https://github.com/jhlywa/chess.js) · [react-chessboard](https://www.npmjs.com/package/react-chessboard) · [chessground (GPL-3.0 — excluded)](https://www.npmjs.com/package/chessground)
- [Lichess API spec](https://github.com/lichess-org/api/blob/master/doc/specs/lichess-api.yaml) · [game export params](https://github.com/lichess-org/api/blob/master/doc/specs/tags/games/api-games-user-username.yaml)
- [chess.com Published-Data API](https://www.chess.com/announcements/view/published-data-api) · [chess.com rate limiting](https://www.chess.com/clubs/forum/view/rate-limiting)
- [COOP/COEP guide (web.dev)](https://web.dev/articles/coop-coep) · [OpenNext Cloudflare](https://opennext.js.org/cloudflare) · [MDN COEP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy)
- [Core Web Vitals / CLS](https://web.dev/articles/cls) · [WCAG 2.1 AA quick reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [WintrChess (GPL-3.0 — methodology reference only)](https://github.com/wintrcat/wintrchess) · [freechess (abandoned)](https://github.com/WintrCat/freechess)
