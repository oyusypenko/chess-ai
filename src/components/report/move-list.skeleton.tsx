import {
  CHIP,
  MOVE_LIST_HEIGHT,
  MOVE_ROW,
  SECTION,
  SECTION_HEADING,
  SKELETON_BAR,
} from "./report-geometry";

/**
 * Paired skeleton for `MoveList` (D-08, `/skeletons`).
 *
 * Server-safe: no `"use client"`, no hooks — a Suspense fallback must be able
 * to render it from a server component.
 *
 * Mirrors the loaded tree node for node and reuses the same geometry constants,
 * so the two cannot drift. Bars are sized to *typical* content (a 4-character
 * SAN plus a chip), not to "looks nice wide" — an over-wide bar pushes its
 * neighbour and the row jumps on load.
 */
export function MoveListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <section className={SECTION} aria-busy="true" role="status" aria-label="Loading moves">
      <h2 className={SECTION_HEADING}>Moves</h2>
      <div
        className={`${MOVE_LIST_HEIGHT} overflow-hidden rounded-lg border border-black/10 p-1 dark:border-white/15`}
      >
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={MOVE_ROW} aria-hidden="true">
            <span className="text-right text-xs tabular-nums text-black/25 dark:text-white/25">
              {i + 1}.
            </span>
            {[0, 1].map((side) => (
              <span key={side} className="flex items-center gap-1.5 px-1 py-0.5">
                <span className={`${SKELETON_BAR} h-4 w-8`} />
                <span className={`${CHIP} ${SKELETON_BAR}`} />
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
