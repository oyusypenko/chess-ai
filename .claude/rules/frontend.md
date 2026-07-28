---
paths:
  - "src/app/**"
  - "src/components/**"
  - "src/features/**"
  - "src/ui/**"
  - "app/**"
  - "next.config.*"
---

# Frontend & report UI (owner: chess-frontend)

Design refs: US-G1, US-D2, FR-7, FR-8, NFR-P1, NFR-C1, NFR-C2, NFR-C3, NFR-L2 · plan §1.2, §1.6.

- **Board stack is licence-constrained**: `chess.js` (BSD-2) for move/PGN/FEN logic,
  `react-chessboard` (MIT) for the board, cburnett pieces (open, attributed).
  **Never `chessground` or `chessops` — both GPL-3.0** and they would relicense our frontend
  (NFR-L3, hook-enforced).
- **COOP/COEP headers** (`Cross-Origin-Opener-Policy: same-origin`,
  `Cross-Origin-Embedder-Policy: require-corp`) are configured in `next.config` and verified by an
  automated smoke test asserting `crossOriginIsolated === true` (FR-7). Changing header config
  without re-running that test is how threads silently break. Note COEP breaks unqualified
  cross-origin embeds — any third-party asset needs CORP/CORS headers.
- **Mobile-first, not merely responsive** (US-G1). Most users are on mobile web. Write base classes
  for narrow screens and add `sm:`/`md:`/`lg:` to _widen_; never build for desktop and rescue it
  with `max-*:`. **360 px is the first viewport you build and verify, not the last.** A layout that
  only lines up at 1440 is not done.
- **Loading states are paired skeletons, not spinners** — see the **`/skeletons`** skill, which is
  mandatory reading before writing any loading state. A report fills in across four separate stages
  (game metadata → engine evals → classifications → LLM summary), so every stage boundary is a CLS
  event unless its skeleton is geometry-exact. Target CLS ≤ 0.05.
- **Verify in a real browser with the Playwright MCP**, at 360 px first. Screenshot and diff
  `getBoundingClientRect()` between loading and loaded states; measure the actual swap with a
  `layout-shift` PerformanceObserver. Arithmetic and class-reading are not verification — Tailwind
  resolves same-property conflicts by stylesheet order, so the class list routinely lies about the
  rendered box.
- **Accessibility is a requirement, not a polish item** (NFR-C2, WCAG 2.1 AA basics): keyboard
  navigation for board and move list (← → through moves), visible focus, sufficient contrast, alt
  text. Classification badges must not encode meaning in colour alone.
- **All strings externalized** from the first component (NFR-C3) — EN at launch, PL and others
  later. No hardcoded user-facing copy.
- **Analysis runs in a Worker, never the main thread.** UI shows per-move progress and offers
  cancel (US-C1).
- Report layout (US-G1, US-D2): move list synced to board · eval graph over the game ·
  classification badge per move · engine line viewer on demand · 3–5 key-moment cards with
  played-vs-best arrows and the grounded explanation, engine line expandable.
- **Degraded states are designed, not accidental**: LLM down → engine-only report with "AI summary
  pending"; single-threaded engine → slower-analysis messaging; import failure → a friendly error,
  never a stack trace (NFR-R1, NFR-R2, US-A1).
- Client-side entitlement checks are **cosmetic only** — the server is the authority (US-F3).
- Landing page TTI < 3 s on 4G mid-range mobile, Core Web Vitals "good" (NFR-P1) — CLS ≤ 0.05 in
  this project, stricter than the 0.1 "good" threshold, because staged report rendering is exactly
  the burst pattern the metric punishes. The engine WASM is lazy-loaded — it must never block first
  paint.
