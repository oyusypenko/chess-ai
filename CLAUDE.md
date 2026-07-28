# ChessCoach AI — post-game AI chess coaching (Lichess + chess.com)

Import a player's **finished** games, analyze them with Stockfish in the browser, classify every
move, and generate a plain-language coaching report — plus a cross-game weakness dashboard (the
retention and paid feature).

Source of truth: **`docs/prd.md`** (what — stories `US-*`, requirements `FR-*`/`NFR-*`) and
**`docs/implementation-plan.md`** (how and in what order — stack decisions, research with sources).
When code and docs disagree, the docs win; when the docs are silent or self-contradictory, never
self-resolve — ask, or record it in `docs/decisions.md`. State lives in `docs/progress.md`, the
**only** tracker in this repo.

This file is the map. Policy lives in **`.claude/rules/`** — `non-negotiables` + `spec-authority`
are always on; `engine-and-classifier`, `llm-and-reports`, `external-apis`, `frontend`, and
`docs-placement` load with the files they govern. Rule violations are bugs, not style: write-time
enforcement is in `.claude/hooks/` (hard-rule grep + Prettier on write, secret/destructive-command
guard on Bash, typecheck on stop).

## The two rules that end the company if broken

1. **Post-game only** (NFR-L1) — no live-game assistance, ever, in any surface. It violates
   Lichess/chess.com fair-play rules, gets our users banned, and gets us delisted.
2. **GPL boundaries** (NFR-L3) — Stockfish is GPLv3 and loads as a **separate WASM artifact**, never
   linked. **`chessground` and `chessops` are GPL-3.0 — never add them**; use `chess.js` (BSD-2) +
   `react-chessboard` (MIT). The classifier is clean-room, not ported from WintrChess (GPL-3.0).

The other four non-negotiables — engine-first/LLM-explains, the grounding validator, no chess.com
IP, server-side enforcement — are in `.claude/rules/non-negotiables.md`, always loaded.

## Map

| Path                                                                                      | What it is                                                                                       | Owner agent     |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------- |
| `src/engine/`, `src/analysis/`, `src/classifier/`                                         | Stockfish WASM in a Worker, UCI bridge, budgets, eval cache, deterministic classifier + fixtures | chess-engine    |
| `src/app/api/`, `src/lichess/`, `src/chesscom/`, `src/llm/`, `src/report/`, `src/server/` | Route handlers, external clients, LLM abstraction + grounding validator, limits/quotas           | chess-backend   |
| `src/app/` (pages), `src/components/`, `src/features/`, `next.config.*`                   | Board, move list, eval graph, key moments, dashboard, COOP/COEP headers, i18n, a11y              | chess-frontend  |
| `docs/`, `.claude/`                                                                       | Authority docs, decision log, tracker, and the project's own scaffolding                         | chess-architect |

**chess-reviewer** is adversarial and fresh-context — run it on the diff before declaring any story
done. It refutes; it never fixes.

## Skills

`/story US-XX` — implement a story with its acceptance criteria as the definition of done ·
`/fairplay-check` — the NFR-L1/L2/L3 gate, required on any diff touching analysis, import, deps, or
assets · `/spec-check` — full PRD compliance audit of a diff · `/progress` — read or update the
tracker (reconciles it against the actual repo) · `/skeletons` — **mandatory before writing any
loading state**: pixel-stable skeleton→content swaps, measured at 360 px with the Playwright MCP.

**The UI is mobile-first.** 360 px is the first viewport built and verified, not the last; base
classes target narrow screens and `sm:`/`md:`/`lg:` widen. Loading states are paired skeletons, not
spinners, and are verified by measurement (CLS ≤ 0.05) rather than by reading class names.

## Phasing

**P0** validation demo (no accounts, Lichess only, one free report, waitlist) → **P1** MVP (OAuth,
dashboard, billing) → **P2** chess.com + share links → **P3** coach/B2B. Don't build P2/P3 while
P0/P1 stories are open. Current state and the next milestone: `docs/progress.md`.

## Stack

Next.js 16 App Router + TypeScript, one app; Tailwind v4; `chess.js` + `react-chessboard`;
Stockfish NNUE WASM in a Worker. **Deployed to Cloudflare Workers via OpenNext** (D-05 — not
Vercel). Signed off in `docs/decisions.md` D-07; rationale lives there, not here.

One platform fact that binds every layer: **COOP/COEP** (`same-origin` / `require-corp`) must stay
configured, because multithreaded WASM requires `crossOriginIsolated === true`. On Cloudflare that
is **two** paths — `next.config.ts` for what the Worker renders, `public/_headers` for assets
served straight off the asset layer. Both are smoke-tested (FR-7); the single-threaded fallback
must keep working (NFR-C1).

## Golden commands

`npm run validate` — typecheck + lint + format + unit tests, the local CI mirror ·
`npm run dev` · `npm run build` · `npm test` (Vitest) ·
`npm run test:e2e` — build + the Playwright suite (360 px and 1280 px) ·
`npm run guardrails` — the project hard rules, the same script CI and the pre-commit hook run ·
`npm run test:headers` — FR-7 smoke test (needs a prior `npm run build`; set `SMOKE_BASE_URL` to
run it against a Worker or a deployed URL instead) · `npm run preview` — the real Worker locally ·
`npm run deploy` — Cloudflare.

**Pre-commit** (`.githooks/pre-commit`, wired by `npm install` via `prepare`) runs all of the
above — including a build and the browser suite — in about 50 s. `SKIP_E2E=1` drops it to ~10 s;
`--no-verify` skips it. Always **build before running Playwright**: `next start` serves the last
build, so a stale one makes missing routes look like application bugs.

## MCP (`.mcp.json`, committed)

- **context7** — current library docs. The docs-first rule is not optional here: Stockfish WASM
  bootstrap, UCI options, Lichess export params, and chess.com PubAPI headers all have
  version-specific details that memory gets wrong. `resolve-library-id` → `get-library-docs` before
  writing integration code.
- **playwright** — real-browser verification, **defaulted to a 360×800 viewport** because this is a
  mobile-first product (US-G1). Every UI change is measured here, not reasoned about: layout at
  360 px, skeleton↔content `getBoundingClientRect()` parity, and `crossOriginIsolated` in an actual
  browser. Widen the viewport explicitly when checking `sm:`/`md:`/`lg:`.

Add a server by editing `.mcp.json` (project scope, committed, **never secrets** — use
`${ENV_VAR}` interpolation). Candidates as the project grows: Postgres (read-only) once P1 lands,
and an issue tracker. Personal-only servers go in user scope via `claude mcp add`, not here.

## Conventions

Commit messages and PR titles carry the requirement ID (`US-C4: win-probability thresholds`).
Secrets never enter the repo or the transcript — `.env*` is deny-listed for reads and shell access.
Personal overrides live in `.claude/settings.local.json` and `CLAUDE.local.md`, both gitignored.
