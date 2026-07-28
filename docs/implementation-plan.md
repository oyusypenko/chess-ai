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

## 3. Phase 0 — Claude Code & repo tooling setup ✅ (this commit)

Organized per the team's Claude Code setup guide (CLAUDE.md / rules / skills / subagents / hooks /
MCP / settings — pick by intent: fact → CLAUDE.md, procedure → skill, isolated job → subagent,
guarantee → hook, external system → MCP, permissions → settings):

| Piece                   | File(s)                                                                                                        | Purpose                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CLAUDE.md**           | `CLAUDE.md`                                                                                                    | Always-on facts: product summary, the six non-negotiables, conventions, phasing. Committed.                                                                                                                                                                                                                                                                                          |
| **Rules** (path-scoped) | `.claude/rules/engine-and-classifier.md`, `.claude/rules/llm-and-reports.md`, `.claude/rules/external-apis.md` | Load only when Claude touches matching files — keeps CLAUDE.md lean while enforcing domain conventions where they apply.                                                                                                                                                                                                                                                             |
| **Skills**              | `.claude/skills/{story,fairplay-check,spec-check,progress}/SKILL.md`                                           | `/story US-XX` implements a story with its ACs as the definition of done; `/fairplay-check` is the NFR-L1/L2/L3 gate required on any analysis/import/deps/assets diff; `/spec-check` audits a diff against the full requirement set; `/progress` reads or updates the tracker, reconciling it against the repo.                                                                      |
| **Subagents**           | `.claude/agents/chess-{architect,engine,backend,frontend,reviewer}.md`                                         | One owner per area (architect owns docs/decisions and `.claude/` itself), plus `chess-reviewer` — fresh-context adversarial pre-merge review that refutes rather than fixes.                                                                                                                                                                                                         |
| **Hooks**               | `hooks` in `.claude/settings.json` + `.claude/hooks/*.sh`                                                      | `check-hard-rules` (PostToolUse: greps writes for GPL deps, live-game surfaces, LLM-evaluates prompts, classifier nondeterminism, misplaced provider SDKs/keys — 15/15 payload tests pass), `format` (Prettier), `protect-secrets` (PreToolUse Bash: blocks `.env` reads and destructive commands), `stop-typecheck` (Stop: tsc). All no-op cleanly until M1 installs the toolchain. |
| **Permissions**         | `.claude/settings.json`                                                                                        | `deny` on `.env*`/secrets/keys reads (NFR-S1 — Claude can't leak what it can't read); `ask` on publish/deploy/merge; `allow` for routine test/lint/git commands.                                                                                                                                                                                                                     |
| **MCP**                 | `.mcp.json` (committed)                                                                                        | **context7** — current library docs. Non-optional here: Stockfish WASM bootstrap, UCI options, Lichess export params, and chess.com PubAPI headers all have version-specific details memory gets wrong. Candidates later: Postgres (read-only) at P1, issue tracker. Never secrets — use `${ENV_VAR}`.                                                                               |
| **Tracker & decisions** | `docs/progress.md`, `docs/decisions.md`, `docs/attribution.md`                                                 | Single tracker (competing filenames forbidden by the `docs-placement` rule); numbered decision log with the four open questions; GPL/asset attribution skeleton that must be complete before launch.                                                                                                                                                                                 |
| **Local overrides**     | `.gitignore`                                                                                                   | `.claude/settings.local.json`, `CLAUDE.local.md`, `.env*` gitignored; everything else under `.claude/` is committed so the team runs the same setup.                                                                                                                                                                                                                                 |

---

## 4. Phase 1 — P0 validation demo (build order)

Each milestone maps to PRD stories; acceptance criteria there are the definition of done.

**M1 · Scaffold & infra** — Next.js + TS app; ESLint/Prettier/Vitest; CI (typecheck, lint, test);
COOP/COEP headers in `next.config` + automated smoke test asserting `crossOriginIsolated` (FR-7);
deploy pipeline (Cloudflare Workers via OpenNext — D-05). **Done 2026-07-28.**

**M2 · Lichess import** — fetch most recent finished game by username (public export API, NDJSON,
with evals/clocks/opening); normalize to internal game model (PGN → positions/moves/clocks);
friendly errors for unknown user / zero games (US-A1); 429 backoff + retry state (FR-2).

**M3 · Engine analysis** — `@lichess-org/stockfish-web` in a Web Worker; per-position budget
(depth ≥ 18 / 1M nodes); progress + cancel; IndexedDB result cache; thread/SIMD feature detection
with single-thread fallback; reuse Lichess server evals with provenance tags (US-C1, US-C2).

**M4 · Move classification** — deterministic win-probability-delta classifier (clean-room);
categories per US-C4; original names + icon set (NFR-L2); ≥ 50-position fixture suite, CI-gated.

**M5 · Report UI** — board (`react-chessboard`) + synced move list + keyboard nav; eval graph;
classification badges; key-moment cards (3–5 largest swings, played-vs-best arrows, expandable
engine line); responsive ≥ 360 px; WCAG AA basics (US-G1, US-D2).

**M6 · AI summary** — server route handler: structured engine payload → LLM (provider
abstraction, Haiku 4.5 default) → **grounding validator** (regenerate once, then strip offending
sentences) → ≤ 250-word rating-band-adapted summary + grounded key-moment explanations;
engine-only degradation path when provider is down; prompt+model version stored (US-D1, FR-4).

**M7 · Launch hardening** — server-side 3 reports/IP/day (Upstash), email capture with GDPR
consent checkbox, funnel telemetry (username → analyzed → viewed → email) (FR-6), privacy policy +
ToS pages (NFR-PR2), Stockfish GPL attribution + source-offer page + cburnett attribution
(NFR-L3/L2), ≤ 60 s p75 end-to-end check (NFR-P2).

## 5. Phase 2 — P1 MVP (outline)

1. **Lichess OAuth (PKCE)** + accounts keyed to Lichess user ID; encrypted token storage;
   Postgres lands here (US-A2).
2. **Game list** — last 20 finished games, filters, "analyzed" badges (US-B1, US-B3).
3. **Reports persistence** + "what to work on" recommendations (US-D3).
4. **Weakness dashboard** — async aggregate jobs, min-sample rule (n ≥ 10), time-trouble
   indicator, ≤ 3 s load from cache (US-E1, US-E2).
5. **Billing & entitlements** — Paddle vs Stripe (open question #1); server-side quota
   enforcement, webhooks → entitlement state, 7-day grace (US-F1–F3).
6. **GDPR** — account deletion (≤ 30 days) + JSON/PGN export (US-A4).

## 6. Risks

| Risk                                                        | Mitigation                                                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| GPL contamination via chessground/chessops/WintrChess code  | MIT/BSD deps only in bundle; clean-room classifier; `/fairplay-check` includes a license pass             |
| WASM threads unavailable (Safari quirks, embedded browsers) | Single-thread fallback + adjusted-expectations messaging; measured perf budget on both paths              |
| ≤ 60 s pipeline on mid-range hardware misses                | Analyze both colors' moves but budget per position; reuse Lichess server evals; show report incrementally |
| LLM hallucinated moves reaching users                       | Grounding validator is a hard gate (regenerate → strip); fixture tests for the validator itself           |
| Anything drifting toward live-game assistance               | NFR-L1 checklist in `/fairplay-check`, enforced on every analysis-touching PR                             |

## 7. Decisions needed from the team (before/at M1)

1. ~~Confirm stack proposal (§2)~~ — resolved by D-07; hosting amended to Cloudflare (D-05).
2. Brand name + domain (blocks OAuth app registration and `User-Agent` string — PRD Q5).
3. Default LLM provider sign-off (Haiku 4.5 proposal, §1.5 — PRD Q3) + DPA check.
4. P0 scope: Lichess-only (recommended) vs incl. chess.com (PRD Q6).

---

### Sources

- [stockfish-web (lichess-org)](https://github.com/lichess-org/stockfish-web) · [npm @lichess-org/stockfish-web](https://www.npmjs.com/package/@lichess-org/stockfish-web?activeTab=versions) · [stockfish.js (nmrugg)](https://github.com/nmrugg/stockfish.js/) · [old stockfish.wasm](https://github.com/lichess-org/stockfish.wasm)
- [chessground](https://www.npmjs.com/package/chessground) · [react-chessboard](https://www.npmjs.com/package/react-chessboard) · [@mdwebb/react-chess](https://www.npmjs.com/package/@mdwebb/react-chess) · [next-chessground](https://github.com/victorocna/next-chessground)
- [Lichess API spec](https://github.com/lichess-org/api/blob/master/doc/specs/lichess-api.yaml) · [Game export & streaming](https://deepwiki.com/lichess-org/api/5.3-game-export-and-streaming)
- [chess.com Published-Data API](https://www.chess.com/announcements/view/published-data-api) · [chess.com rate limiting](https://www.chess.com/clubs/forum/view/rate-limiting)
- [COOP/COEP guide (web.dev)](https://web.dev/articles/coop-coep) · [OpenNext Cloudflare](https://opennext.js.org/cloudflare) · [MDN COEP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy)
- [WintrChess (GPL-3.0)](https://github.com/wintrcat/wintrchess) · [freechess (abandoned)](https://github.com/WintrCat/freechess)
