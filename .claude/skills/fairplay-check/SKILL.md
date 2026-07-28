---
name: fairplay-check
description: >-
  Run the mandatory fair-play, licensing, and IP review checklist (NFR-L1/L2/L3) on a diff. Use
  before merging anything that touches analysis, game import, dependencies, assets, or any
  user-facing surface — and whenever the user says "fairplay check", "licence check", "can we ship
  this", "is this GPL-safe", or asks whether something breaks Lichess/chess.com fair-play rules.
  Reports a verdict; does not fix.
---

# Fair-play, licensing & IP gate

Review the diff against each item below. Scope: `$ARGUMENTS` if it names files/dirs; otherwise
`git diff HEAD` + staged + untracked; if the tree is clean, the last commit.

Report **PASS/FAIL per section** with `file:line` evidence for every FAIL or concern. This gate
exists because each of these failures is unrecoverable in a different way: rule 1 gets our users
banned and the product delisted, rule 3 forces us to open-source our codebase, rule 2 gets us sued.

## 1. Post-game only (NFR-L1) — a FAIL here blocks merge unconditionally

- [ ] No code path accepts, streams, polls, or analyzes an **in-progress** game. Check import
      filters, any websocket/event-stream subscription, any "current/ongoing game" concept, and
      anything reading a board state that isn't from a finished PGN.
- [ ] Imported games are verified **finished** before entering the analysis pipeline.
- [ ] No UI, extension, notification, or API surface could deliver evals, best moves, or
      classifications to a user while they have a live game running.
- [ ] Nothing in the diff makes a future live-game feature _easier_ by leaving a hook for it.

There is no override for this section. If it fails, the change does not merge.

## 2. No chess.com IP (NFR-L2)

- [ ] No chess.com piece sets, sounds, glyph/badge artwork, or their exact badge naming
      ("Brilliant", "Great Move" as branded glyph designs).
- [ ] Classification names and icons are our own originals.
- [ ] Every bundled open-licensed asset (cburnett pieces, fonts, icons) has an entry in
      `docs/attribution.md` with its licence.

## 3. GPL boundaries (NFR-L3)

- [ ] **No `chessground`, no `chessops`** — both GPL-3.0 — in `package.json`, lockfile, or imports.
      Approved: `chess.js` (BSD-2), `react-chessboard` (MIT).
- [ ] No new dependency under GPL/AGPL entered the bundle. Check the diff of `package.json` **and**
      the lockfile for transitive additions; verify licence of anything new.
- [ ] Stockfish remains a **separate WASM artifact loaded at runtime** — never linked, inlined, or
      statically bundled with our code. The `postMessage`/UCI boundary is intact.
- [ ] `docs/attribution.md` still accurately states the Stockfish GPLv3 notice and source offer.
- [ ] No code copied from WintrChess/freechess — the classifier is a clean-room re-implementation
      of the methodology. (Reviewing for this means reading the logic, not just checking imports.)
- [ ] Nothing in the diff commits us to mobile bundling, which needs legal review first.

## 4. Adjacent guarantees

- [ ] chess.com API calls (if any) go through the backend proxy with the custom `User-Agent`, serial
      per user (FR-1).
- [ ] No secrets, tokens, or emails in code, prompts, or LLM payloads (NFR-S1, NFR-PR1).
- [ ] Rate limits, quotas, and entitlements remain enforced **server-side** (US-F1, US-F3).
- [ ] The LLM is never asked to evaluate a position; the grounding validator is not bypassed or
      weakened (US-D1).

## Output

```
FAIRPLAY CHECK: PASS | FAIL

1. Post-game only (NFR-L1):  PASS | FAIL — <evidence>
2. chess.com IP (NFR-L2):    PASS | FAIL — <evidence>
3. GPL boundaries (NFR-L3):  PASS | FAIL — <evidence>
4. Adjacent guarantees:      PASS | FAIL — <evidence>

Failures: <file:line — what and which rule; or none>
Concerns (non-blocking): <list or none>
Unverifiable: <anything you could not check, and why — this counts as not-passed>
```

Do not fix anything here; this gate only reports. Findings go to the owning agent.
