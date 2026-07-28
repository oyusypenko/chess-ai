---
paths:
  - "src/engine/**"
  - "src/analysis/**"
  - "src/classifier/**"
  - "src/**/workers/**"
  - "public/engine/**"
---

# Engine & move classification (owner: chess-engine)

Design refs: US-C1, US-C2, US-C4, FR-3, FR-7, NFR-C1, NFR-P2 · plan §1.1–1.2.

## Engine

- Stockfish NNUE WASM (`@lichess-org/stockfish-web`) runs **in a Web Worker**, spoken to over UCI.
  Never on the main thread — the board must stay responsive during analysis.
- **Per-position budget: depth ≥ 18 OR ≥ 1M nodes, whichever lands first.** A full ~40-move game
  completes in ≤ 45 s on 2020+ mid-range hardware; the whole pipeline is ≤ 60 s p75 (NFR-P2). If a
  change makes analysis slower, measure it — don't guess.
- Multithreading requires `crossOriginIsolated === true`. **Feature-detect it and `SharedArrayBuffer`
  at runtime**; the single-threaded build must keep working with adjusted-expectations messaging
  (NFR-C1). Never assume threads are available.
- Analysis is **cancelable** and reports per-move progress. Results cache by
  `gameId + engineVersion` (IndexedDB) — re-opening a game never re-analyzes (US-C1, FR-3).
- Every eval carries **provenance**: `lichess-server` | `local-engine` | `cloud` (US-C2). Positions
  that already have a Lichess server eval skip local engine work.
- The engine is a GPLv3 artifact loaded at runtime — never bundled or linked into our code
  (NFR-L3). Keep the boundary a clean `postMessage` interface.

## Classifier

- **Deterministic, pure function.** Same (position, played move, engine evals) → same label, every
  run. No `Math.random`, no `Date.now`, no engine re-queries inside classification, no I/O. The
  hard-rules hook blocks nondeterminism in this directory.
- Classification is computed from **win-probability deltas**, not raw centipawns — cp is
  misleading at extreme evals. Thresholds live in one documented constants module; no inline magic
  numbers, and the rationale is written down (the methodology must be explainable, US-E2).
- Categories: Best / Great / Good / Book / Inaccuracy / Mistake / Blunder / Missed win /
  Brilliant-type sacrifice. **Our own names and icon set** — never chess.com's glyphs or branding
  (NFR-L2).
- **Clean-room only.** WintrChess/freechess is GPL-3.0: re-implement the methodology from its
  description, never copy code (NFR-L3).
- **Fixtures are the spec.** ≥ 50 curated positions with expected labels, CI-gated. New behavior
  gets its fixture first; a threshold change that moves a fixture is a deliberate decision to
  record, not a test to update quietly.
- Chess edge cases that bite here: promotion/underpromotion, castling rights, en passant, mate
  scores (`#N`) vs centipawns, and **side-to-move perspective flips** — a black blunder is a
  positive delta from white's view. Test both colors.
