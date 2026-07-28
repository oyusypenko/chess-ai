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
- Version shipped: _TBD at M3_
- **Source offer:** _TBD — must link to the exact source corresponding to the binary we serve,_
  _hosted by us or a permanent upstream link, per GPLv3 §6._

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
