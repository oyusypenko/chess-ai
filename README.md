# ChessCoach AI

Post-game AI chess coaching for Lichess and chess.com players.

Import your finished games, analyze them with Stockfish running **in your browser**, get every move
classified, and read a plain-language explanation of what actually went wrong — then watch your
recurring weaknesses across games in a dashboard.

> **Status: pre-implementation.** This repository currently contains the product requirements, the
> implementation plan, and the engineering guardrails. No application code yet — milestone M1
> scaffolds the app. See [`docs/progress.md`](docs/progress.md) for live status.

---

## Why

Free engine analysis already exists and is excellent. What it doesn't do is _explain_. A 1200-rated
player looking at `23. Nf5!! +1.7` learns nothing: they can see the eval jumped, not why the move
worked or what pattern they missed. ChessCoach AI turns engine output into an explanation, and
turns explanations across many games into a picture of what to actually practice.

## How it works

```
finished game → normalize → Stockfish (browser, WASM) → classify every move
                                                              ↓
                    report ← grounding validator ← LLM narrates structured engine output
                                                              ↓
                                              cross-game weakness dashboard
```

**Engine-first, LLM-explains.** The language model never evaluates a position. It receives only
structured engine output — FENs, the move played, top-k engine moves with evaluations, win
probability deltas, game phase, motif tags, clock times — and puts it into words. Every move and
square it mentions is then verified against the real game and the engine's principal variations
before anything renders. A hallucinated move never reaches a user.

Analysis runs client-side, so engine compute costs nothing and scales with users rather than
against them.

## Two constraints that shape everything

**Post-game only.** No feature may assist during a live game — no overlays, no real-time
evaluation, no extension that reads an in-progress board. Real-time help violates Lichess and
chess.com fair-play rules, gets users banned, and gets products delisted. This is enforced in
tooling, not just documented.

**Licensing boundaries.** Stockfish is GPLv3 and ships as a separate WebAssembly artifact loaded at
runtime over a `postMessage`/UCI boundary — never linked or bundled into application code. The same
care applies to npm dependencies: `chessground` and `chessops` are GPL-3.0 and would relicense the
frontend, so the stack uses [`chess.js`](https://github.com/jhlywa/chess.js) (BSD-2) and
[`react-chessboard`](https://github.com/Clariity/react-chessboard) (MIT) instead. The move
classifier is a clean-room implementation. See [`docs/attribution.md`](docs/attribution.md).

## Documentation

| Document                                                     | What it covers                                                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| [`docs/prd.md`](docs/prd.md)                                 | Product requirements — user stories (`US-*`), functional (`FR-*`) and non-functional (`NFR-*`) requirements. The authority doc. |
| [`docs/implementation-plan.md`](docs/implementation-plan.md) | Library research with sources, stack proposal, milestones M1–M7, risks                                                          |
| [`docs/progress.md`](docs/progress.md)                       | Current state — the single tracker                                                                                              |
| [`docs/decisions.md`](docs/decisions.md)                     | Numbered decision log and open questions                                                                                        |
| [`docs/attribution.md`](docs/attribution.md)                 | Third-party licences and the GPLv3 source offer                                                                                 |
| [`CLAUDE.md`](CLAUDE.md)                                     | Map of the codebase and its conventions                                                                                         |

## Planned stack

Next.js 16 (App Router) + TypeScript as a single app, deployed to **Cloudflare Workers** via
[OpenNext](https://opennext.js.org/cloudflare); Stockfish NNUE WASM
([`@lichess-org/stockfish-web`](https://github.com/lichess-org/stockfish-web)) in a Web Worker;
`chess.js` + `react-chessboard`; Tailwind v4; IndexedDB for the analysis cache. Provider-agnostic
LLM layer.

Multithreaded WASM requires cross-origin isolation, so the app ships `COOP`/`COEP` headers — in
`next.config.ts` for Worker-rendered responses and `public/_headers` for Cloudflare's static-asset
layer — with a smoke test that asserts them against both. Browsers without threads get a
single-threaded fallback rather than an error.

## Roadmap

| Phase  | Scope                                                                                  |
| ------ | -------------------------------------------------------------------------------------- |
| **P0** | Validation demo — enter a Lichess username, get one full AI-coached report, no account |
| **P1** | MVP — Lichess OAuth, game list, weakness dashboard, free/paid tiers                    |
| **P2** | chess.com import, study recommendations, share links                                   |
| **P3** | Coach/club dashboard, drills                                                           |

## Development

```bash
npm install
npm run dev          # http://localhost:3000
npm run validate     # typecheck + lint + format + unit tests (the local CI mirror)
npm run test:e2e     # build, then the Playwright suite at 360px and 1280px
npm run preview      # build and run the real Cloudflare Worker locally
```

### The pre-commit hook

`npm install` points git at `.githooks/` (via the `prepare` script), so every commit runs the
full gate: typecheck, lint, format, unit and integration tests, the project hard rules, a build,
the FR-7 cross-origin-isolation smoke test, and the end-to-end browser suite. About 50 seconds.

The browser suite is in there on purpose. Every expensive bug in this project so far has been one
only a real browser and a real server could surface — COOP/COEP silently absent so the engine
dropped to a single thread, a `Secure` cookie that browsers sent to loopback and HTTP clients
didn't, a seeded database unlinked out from under a live file handle. None of those fail a unit
test.

It builds before running Playwright, always: `next start` serves whatever was last built, and a
stale build is worse than no run at all — missing routes return 404 and read as application bugs.

When it's the wrong trade:

```bash
SKIP_E2E=1 git commit …   # static checks + unit tests only (~10s)
git commit --no-verify …  # skip the hook entirely
```

The hook checks the working tree rather than the staged index. Stashing unstaged changes to
isolate the index is the textbook approach and it loses work when a run is interrupted; the cost
is that a partial `git add` can pass the hook and still commit something broken, which is what CI
is for.

Verifying cross-origin isolation (FR-7) needs a build first:

```bash
npm run build && npm run test:headers
# or against any running target, including a deployment:
SMOKE_BASE_URL=https://example.workers.dev npm run test:headers
```

This repo is set up for [Claude Code](https://claude.com/claude-code). `CLAUDE.md` and everything
under `.claude/` is committed so contributors run the same rules, agents, and checks:
path-scoped rules that load with the files they govern, per-area agents, an adversarial pre-merge
reviewer, and write-time hooks that block GPL dependencies, live-game surfaces, and
nondeterminism in the classifier before they land.

## Licence

Not yet determined — no `LICENSE` file means all rights reserved for now. Bundled third-party
components keep their own licences, documented in [`docs/attribution.md`](docs/attribution.md).
Stockfish is GPLv3; the required source offer will be published before launch.
