# Attribution & licences

**Legally required before launch** (NFR-L3, NFR-L2). This page must be reachable from the product
UI, not just the repo. Every third-party artifact we ship appears here with its licence, and the
GPLv3 source offer must be live and accurate.

> **Status: skeleton.** Entries are filled in as dependencies land (M1 onward) and verified by
> `/fairplay-check` before launch. An entry with an unverified licence is a launch blocker.

---

## Stockfish — GPLv3

Stockfish is a free and open-source UCI chess engine licensed under the **GNU General Public
License version 3**.

- Upstream: https://github.com/official-stockfish/Stockfish
- WASM build we ship: `@lichess-org/stockfish-web` — https://github.com/lichess-org/stockfish-web
- **Build shipped:** `sf_18_smallnet` (Stockfish 18 with the `sscg13/threat-small` network), from
  `@lichess-org/stockfish-web` — exact version pinned in `package-lock.json`.
- **Files served** from `/engine/` (staged by `scripts/fetch-engine-assets.mjs`, not committed):
  `sf_18_smallnet.js`, `sf_18_smallnet.wasm`, `nn-4ca89e4b3abf.nnue` (14.4 MB), and a verbatim
  copy of the GPLv3 licence as `LICENSE.stockfish.txt`.
- **Neural network:** `nn-4ca89e4b3abf.nnue`, fetched from `data.stockfishchess.org`. Self-hosted
  rather than CDN-loaded because COEP `require-corp` (FR-7) blocks cross-origin subresources — the
  same headers the threaded engine requires.
- **Source offer:** _still TBD — a launch blocker._ Must resolve to the exact sources corresponding
  to the binaries we serve. Two acceptable forms under GPLv3 §6: link the upstream commits that
  `@lichess-org/stockfish-web` built from (its `patches/sf_18.patch` plus the pinned Stockfish
  base commit), or mirror those sources ourselves. Pick one and publish it on the user-facing
  attribution page before launch.

**Why the small net:** the big-net build (`sf_18`) needs two networks totalling far more download
for a strength difference that does not change a move's classification at depth 18. On mobile web —
our primary surface (US-G1) — payload decides whether the feature is usable at all (NFR-P1).

**Boundary (NFR-L3):** Stockfish runs as a **separate WebAssembly artifact loaded at runtime** in a
Web Worker, communicated with over the UCI protocol via `postMessage`. It is not linked, inlined,
or statically bundled with our application code, which keeps our proprietary code outside the
derivative-work scope. Any change to that boundary — or any proposal to bundle the engine into a
mobile app — requires legal review **before** commitment.

## Piece set — cburnett

- Source: Lichess `lila` asset set, originally by Colin M.L. Burnett
- Licence: _TBD — confirm the exact licence (GPL/CC-BY-SA variants exist for this set) before_
  _shipping; if the available licence is GPL, choose a permissively-licensed set instead._
- Files: _TBD at M5_

> ⚠️ Do not assume this set is permissive because it is widely used. Verify the licence of the exact
> files we ship and record it here. If the licence would contaminate our bundle, pick another set —
> the requirement is an open-licensed set with attribution (US-G1), not this specific one.

## Chess logic & UI libraries

| Package            | Licence      | Why it's safe to bundle                            |
| ------------------ | ------------ | -------------------------------------------------- |
| `chess.js`         | BSD-2-Clause | Permissive — move generation, SAN/FEN, PGN parsing |
| `react-chessboard` | MIT          | Permissive — board rendering                       |

**Explicitly excluded** (see `docs/decisions.md` D-01): `chessground` and `chessops` are
**GPL-3.0**; bundling either would relicense our frontend. Blocked at write time by
`.claude/hooks/check-hard-rules.sh`.

## Move classification methodology

Our classifier is a **clean-room re-implementation** (D-03). The methodology — win-probability
deltas over raw centipawns, and the general category taxonomy — follows publicly described
approaches including the open-source WintrChess/freechess project (GPL-3.0). **No code was copied
from it.** Our category names, thresholds, and icon set are original (NFR-L2 — nothing derived from
chess.com's glyph designs or badge branding).

## Dependency licence audit

Last run **2026-07-28** (M1), via `license-checker-rseidelsohn --production` over 856 resolved
packages. Everything is permissive except the three below, each checked individually:

| Package                           | Licence           | Verdict                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@img/sharp-libvips-darwin-arm64` | LGPL-3.0-or-later | **Not shipped.** Native libvips binary behind `sharp`, pulled in as an optional platform dep (and as a dev dep via miniflare). Verified absent from the deployed Worker: 0 references in `.open-next/worker.js`, no `.node`/libvips artifacts in the bundle. LGPL also permits dynamic linking without copyleft reach. |
| `caniuse-lite`                    | CC-BY-4.0         | **Build-time data, not code.** A browser-support database consumed by browserslist during the build. Attribution satisfied by this entry.                                                                                                                                                                              |
| `chess-ai` (this package)         | UNLICENSED        | **Us.** `"private": true` with no `license` field — matches the all-rights-reserved posture in the README. Revisit if a licence is chosen.                                                                                                                                                                             |

**No GPL-3.0 packages are present**, directly or transitively — `chessground` and `chessops` are
absent from `package.json` and from the lockfile (D-01, NFR-L3). This is enforced three ways: the
Claude Code write-time hook, the CI `guardrails` job, and `/fairplay-check` §3.

Re-run this audit whenever `package.json` changes.

## Fonts, icons, and other assets

_TBD — one row per asset: file, source, licence, attribution text required._
Currently none: the M1 scaffold ships no fonts or icon sets, and the default Next.js SVGs were not
copied in.

---

## Maintenance

- Any new dependency, asset, or engine version updates this file **in the same PR**.
- `/fairplay-check` section 3 verifies this page is accurate against the current bundle.
- A dependency whose licence is unverified does not ship.
