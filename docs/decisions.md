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
**Why:** WintrChess/freechess is GPL-3.0. US-C4 permits following the *methodology*
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

---

## Open — need a decision from the user

These block work at the milestone named. Recorded here so they aren't silently assumed.

| # | Question | Blocks | Recommendation | Source |
|---|---|---|---|---|
| O-1 | Stack: single Next.js app + Vercel EU region for P0? | M1 | Yes — fastest path to a validated demo; revisit hosting at P1 when Postgres lands | plan §2 |
| O-2 | Brand name + domain | OAuth app registration, chess.com `User-Agent` string | — | PRD Q5 |
| O-3 | Default LLM provider + model | M6 | Claude Haiku 4.5 (~$0.01/report, inside the $0.02 budget); premium tier Sonnet 5 behind a flag. Needs an EU DPA check (NFR-PR1) | PRD Q3, plan §1.5 |
| O-4 | P0 scope: Lichess-only or chess.com from day one? | M2 | Lichess-only — chess.com needs the backend proxy (FR-1) earlier and adds no validation signal | PRD Q6 |
| O-5 | Billing: Paddle vs Stripe | P1 / US-F2 | Paddle — merchant-of-record offloads EU VAT | PRD Q1 |
| O-6 | Pricing point and annual discount | P1 / US-F2 | Placeholder $6.99/mo, $49/yr per PRD | PRD Q2 |
| O-7 | Is engine-only analysis truly unlimited on free? | P1 / US-F1 | — | PRD Q4 |
