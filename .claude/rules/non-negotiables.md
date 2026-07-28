# The non-negotiables (always loaded)

Six hard lines. These are product/legal constraints, not preferences — a violation is a bug, and
in the case of rule 1, a company-ending one. Flag any request that conflicts with them instead of
implementing it. Write-time enforcement lives in `.claude/hooks/check-hard-rules.sh`; review-time
enforcement in `/fairplay-check`.

1. **Post-game only** (NFR-L1). Never build anything that assists during a live game — no overlays,
   no real-time eval, no extension that reads an in-progress board, no import path that accepts an
   unfinished game. This violates Lichess/chess.com fair-play rules, gets users banned, and gets
   the product delisted. Applies to every PR touching analysis, import, or extension code.
2. **Engine-first, LLM-explains** (§1 PRD, US-D1). The LLM never evaluates a position. It receives
   only structured engine output (FENs, played move, top-k engine moves + evals, deltas, phase,
   motif tags, ratings, clocks) and narrates it. A prompt that asks "is this move good?" is a bug.
3. **The grounding validator is a hard gate** (US-D1). Every move/square the LLM mentions is
   checked against the real game and engine PVs before render: regenerate once, then strip the
   offending sentences. A hallucinated move must never reach a user.
4. **No chess.com IP** (NFR-L2). No chess.com piece sets, sounds, glyph art, or badge naming.
   Classification labels and icons are our own originals. Open-licensed assets (cburnett pieces)
   require the attribution page.
5. **GPL boundaries** (NFR-L3). Stockfish is GPLv3 and ships as a **separate WASM artifact loaded
   at runtime** — never linked or bundled with our code; attribution + source-offer page required.
   The same trap applies to npm deps: **chessground and chessops are GPL-3.0** — bundling either
   makes our frontend GPL. Use `chess.js` (BSD-2) + `react-chessboard` (MIT). WintrChess/freechess
   is GPL-3.0: the classifier is a **clean-room re-implementation** of the methodology, never
   copied code. Mobile bundling needs legal review before any commitment.
6. **Server-side enforcement** (US-F1, US-F3). Rate limits, free-tier quotas, and entitlements are
   enforced on the server. Client-side checks are cosmetic only. LLM calls are server-mediated —
   provider keys never reach client-reachable code.
