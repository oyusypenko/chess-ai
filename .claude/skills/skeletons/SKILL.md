---
name: skeletons
description: >-
  Create, fix, or audit paired loading skeletons so the skeleton→content swap is pixel-stable — no
  CLS, no flash, no reflow. Covers the *.skeleton.tsx convention, shared *-geometry.ts class
  constants, measuring RENDERED boxes instead of trusting Tailwind class intent, the chess-specific
  surfaces (board, move list, eval graph, key moments), and the mandatory mobile-first Playwright
  MCP measure/diff loop. Trigger keywords: skeleton, loading state, CLS, layout shift, flash,
  flicker on load, Suspense fallback, pulse bar, placeholder, aria-busy, shimmer, loading.tsx,
  skeleton parity, jank while analyzing.
---

# Skeletons — pixel-stable loading states

A skeleton exists to make the skeleton→content swap **invisible in geometry**: nothing moves when
data lands. "Roughly the same size" is not the bar. The target is 1:1 — the same element tree, the
same wrapper classes, with pulsing bars only where leaf text/images go.

**This app is unusually exposed to layout shift.** A report page fills in over tens of seconds in
stages: game metadata arrives from Lichess, then per-move evals stream out of the engine worker,
then classifications resolve, then the LLM summary lands (US-C1, US-D1). That is four separate
swaps on one screen, several of them mid-viewport while the user is already reading. Every one is a
CLS event unless its skeleton is geometry-exact.

## Why: skeletons ARE the CLS mitigation

NFR-P1 requires Core Web Vitals "good" — CLS ≤ 0.1 at field p75. **This project targets ≤ 0.05.**

A sloppy skeleton is worse than none: it converts one shift (empty→content) into a mid-viewport
shift that scoring counts at full weight.

- **Scoring:** each shift = impact fraction × distance fraction; CLS is the **largest session
  window** (shifts < 1 s apart, 5 s max window, biggest burst wins), not a page total. Shifts
  within 500 ms after a _discrete_ input (click/tap/keypress) are excluded — **scroll and drag are
  not discrete input**, so shifts while scrolling still count. Our staged report fill is exactly
  the "biggest burst" pattern the metric punishes.
- **What causes shift, and the skeleton-side answer:** late content without reserved space → 1:1
  geometry and fixed grid tracks; media without dimensions → `aspect-ratio` on every media leaf
  (the board is a perfect square — always reserve it that way); font swap moving text →
  metric-adjusted fallback or `font-display: optional`; UI injected above what the user is reading
  → never (the "AI summary pending" state must reserve its final height, not grow into it);
  animating layout properties → `transform`/`opacity` only.

## Mobile-first is not optional here

**Design and measure at 360 px first, then scale up.** US-G1 requires the report to work down to
360 px, and most of our users are on mobile web. A layout that is built desktop-first and squeezed
down will shift differently — often worse — on the viewport that matters most.

- Write the base classes for narrow screens; add `sm:` / `md:` / `lg:` to _widen_, never
  `max-*:` to rescue a desktop layout.
- **Every skeleton is verified at 360 px before any wider width.** If it only lines up at 1440, it
  is not done.
- Vertical space is the scarce resource on mobile: a skeleton that reserves a desktop-height block
  pushes real content below the fold and reads as a bug.

## Conventions (non-negotiable)

- **Paired sibling file**: `<component>.skeleton.tsx` next to the loaded component.
- **Server-safe**: no `"use client"`, no hooks, static markup only — a Suspense fallback or
  `loading.tsx` must be able to import it from a server component.
- **A11y shell**: root gets `aria-busy="true"`, `role="status"`, and an `ariaLabel` prop with a
  sensible default ("Loading analysis…"); every bar is `aria-hidden="true"`. Screen-reader users
  get one announcement, not a pile of empty boxes.
- **Respect `prefers-reduced-motion`**: the pulse must not animate for users who asked it not to
  (NFR-C2). Gate `animate-pulse` behind `motion-safe:`.
- **Shared geometry**: any class string both sides render moves to a sibling `*-geometry.ts`
  module with no `"use client"` directive, imported by both. Never copy-paste the string — copies
  drift, imports cannot.
- **Mirror the loaded props that change geometry** (`className`, size/variant props) so the
  skeleton can mount in every chrome the real component supports.

## The 1:1 method

1. **Read the loaded component's JSX** and copy its element tree node for node. Every wrapper keeps
   its class; only leaves become bars.
2. **Extract shared geometry constants** to `*-geometry.ts` (see above).
3. **Prefer fixed geometry in the loaded component itself.** Content-sized layouts (flex
   `justify-between`, `auto` grid columns) shift as values pop in. Give the loaded layout fixed
   fractional tracks or fixed-height rows where the design allows, and share them — then bars vs
   values _cannot_ move siblings.
4. **Per-datum loading states.** Our data arrives in stages from different sources, so a single
   page-level skeleton is usually wrong. Give leaf components a `loading?: boolean` prop that
   renders a value-height bar in place of the value (+ `aria-busy`). Skeleton while the **source**
   is in flight; an honest "—" once it resolved empty.
5. **Never let a stage's arrival resize its container.** The eval graph must occupy full height
   while empty; the move list must reserve its rows; the summary card must reserve its final
   height and fill in.

## Chess-specific surfaces

| Surface                     | Reservation strategy                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Board**                   | Perfect square — `aspect-square` with a width-driven size. Never let the piece set or a late FEN determine the box. At 360 px the board is roughly the full column width; reserve it identically.      |
| **Move list**               | Fixed row height × a fixed visible row count, scroll inside. Reserving "however many moves the game had" means the box changes per game — reserve a viewport, not the content.                         |
| **Eval graph**              | Fixed height from the first paint, with the axis rendered and the line absent. It fills in per move as the engine streams (US-C1) — the container must never grow.                                     |
| **Classification badges**   | Fixed-size chip per move regardless of label length. "Blunder" and "Best" must occupy the same box or the whole move list reflows as classification resolves.                                          |
| **Key-moment cards**        | 3–5 cards (US-D2) each with a reserved board thumbnail (`aspect-square`) and a fixed number of text lines. Reserve all five slots if that is what will render.                                         |
| **AI summary**              | Reserve the ≤ 250-word block's typical height (US-D1). Critically: the engine-only degradation path renders _this same box_ with "AI summary pending" — the retry landing must not resize it (NFR-R1). |
| **Progress-bearing states** | Per-move analysis progress is a _determinate_ state, not a skeleton. Show real progress; keep the geometry identical to the finished state.                                                            |

## Measure rendered boxes — never trust class intent

The class list lies. Tailwind resolves same-property conflicts by **stylesheet order** (later rule
wins), not class-attribute order. Recurring traps:

- `leading-normal` / `leading-snug` **beat** `leading-none` — a `text-base leading-none`-looking
  value can render a 24 px line box.
- Arbitrary values (`text-[clamp(...)]`, `text-[32px]`) sort after named scales and win.
- `text-[10px]` beats `text-xs` for font-size, but `text-xs`'s own `line-height` survives — the box
  is 10 px × snug ≈ 13.75 px.
- `!`-prefixed utilities always win — those you can trust.

Other traps:

- A bare `<span>` bar is inline — `h-*` is ignored unless it is a flex/grid item or you add `block`.
- **Bar width matters in `auto`-sized columns**: an over-wide bar pushes its neighbour, which then
  jumps on load. Size bars to _typical_ content (measure a real game), not to "looks nice".
- A transparent control gets a transparent **spacer**, not a solid bar — a dark block that vanishes
  on load is itself a flash.
- Content-driven conditionals (an opening name that is absent for some games, a clock row that only
  exists when the game had clocks) — decide explicitly whether the skeleton reserves them, and
  comment why.

## Verification loop (mandatory — never ship on arithmetic alone)

Use the **Playwright MCP** against the running app. Do not eyeball it; measure it.

1. `npm run dev`, then drive the page with Playwright MCP.
2. At **360 px first**, then 768 and 1280: screenshot the skeleton state and the loaded state, and
   diff `getBoundingClientRect()` for every corresponding node (section, zones, rows, bars vs
   leaves). To hold the skeleton state, throttle the network or stub the data source.
3. Fix any mismatch > ~4 px, then re-measure. **Look at the screenshots too** — numbers miss
   perceptual problems (a solid block over a transparent control, chunky bars, a pulse that reads
   as broken).
4. **Measure the real swap**, which is the only number that counts. With the page loading, run a
   `PerformanceObserver({ type: "layout-shift", buffered: true })` and sum the entries across the
   swap; the contribution should be ≈ 0 and must be < 0.05.
5. Gates before shipping: `npm run validate`, plus the a11y check that `role="status"` /
   `aria-busy` disappear once loaded.

Record the measured numbers in the PR. A skeleton signed off without a rect-diff at 360 px has not
been verified — the rect-diff _is_ the CLS proxy: any corresponding-node delta means the real swap
will shift layout.
