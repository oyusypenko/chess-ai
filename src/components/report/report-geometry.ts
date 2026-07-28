/**
 * Shared geometry constants for the report (D-08, `/skeletons`).
 *
 * **Every class string that both a component and its skeleton render lives
 * here.** Not because it is tidier, but because a copy-pasted class string
 * drifts the moment one side is edited — and a skeleton that drifts is worse
 * than no skeleton, since it converts one layout shift into a mid-viewport one
 * that CLS scores at full weight.
 *
 * No `"use client"` in this file: skeletons must be importable from server
 * components for Suspense fallbacks.
 *
 * Mobile-first: base classes target 360 px; `sm:`/`md:`/`lg:` widen.
 */

/** The board is a perfect square — never let a late FEN or piece set size it. */
export const BOARD_WRAPPER = "w-full aspect-square max-w-[min(100vw-2rem,32rem)]";

/**
 * Move list reserves a *viewport* of rows, not N rows.
 *
 * Games vary from 10 to 200 moves; reserving the real count would make the box
 * a different height for every game, which is exactly the shift we are trying
 * to avoid. Fixed height + internal scroll keeps the page stable.
 */
export const MOVE_LIST_HEIGHT = "h-[13.5rem] sm:h-[17rem]";
export const MOVE_ROW = "grid grid-cols-[2.5rem_1fr_1fr] items-center gap-1 h-8 text-sm";

/** Eval graph is fixed-height from first paint; the line fills in per move. */
export const EVAL_GRAPH_HEIGHT = "h-24 sm:h-32";

/**
 * Classification chips are fixed-size regardless of label length.
 * "Excellent" and "Best" must occupy the same box or the whole move list
 * reflows as classifications resolve.
 */
export const CHIP =
  "inline-flex items-center justify-center h-5 w-[4.75rem] rounded text-[0.6875rem] font-medium";

/** Key-moment cards: fixed board thumbnail + a fixed number of text lines. */
export const MOMENT_CARD = "rounded-lg border border-black/10 dark:border-white/15 p-3 flex gap-3";
export const MOMENT_THUMB = "w-20 shrink-0 aspect-square rounded overflow-hidden";
export const MOMENT_TEXT_BLOCK = "flex-1 min-w-0 flex flex-col gap-1";

/**
 * The summary box height is load-bearing for NFR-R1.
 *
 * The "AI summary pending" degradation state renders in *this same box*. If the
 * box grows when real text arrives, the degradation path causes a layout shift
 * every time the provider recovers.
 */
export const SUMMARY_BOX =
  "rounded-lg border border-black/10 dark:border-white/15 p-4 min-h-[11rem]";

export const SECTION = "flex flex-col gap-3";
export const SECTION_HEADING = "text-sm font-semibold tracking-tight";

/** Pulse that respects prefers-reduced-motion (NFR-C2). */
export const SKELETON_BAR = "motion-safe:animate-pulse rounded bg-black/10 dark:bg-white/15";
