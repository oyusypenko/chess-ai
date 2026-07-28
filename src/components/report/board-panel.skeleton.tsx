import { BOARD_WRAPPER, SECTION, SKELETON_BAR } from "./report-geometry";

/**
 * Paired skeleton for `BoardPanel` (D-08).
 *
 * Reuses `BOARD_WRAPPER` verbatim, which is the whole point: the board is the
 * largest element on a 360 px screen, so any mismatch here moves everything
 * below it. An 8×8 checker pattern rather than one grey block — the swap is
 * then imperceptible instead of a flash from solid to detailed.
 */
export function BoardPanelSkeleton({ caption = true }: { caption?: boolean }) {
  return (
    <section className={SECTION} aria-busy="true" role="status" aria-label="Loading board">
      <div className={`${BOARD_WRAPPER} overflow-hidden rounded`} aria-hidden="true">
        <div className="grid h-full w-full grid-cols-8 motion-safe:animate-pulse">
          {Array.from({ length: 64 }, (_, i) => {
            const dark = (Math.floor(i / 8) + i) % 2 === 1;
            return (
              <div
                key={i}
                className={dark ? "bg-black/15 dark:bg-white/15" : "bg-black/5 dark:bg-white/5"}
              />
            );
          })}
        </div>
      </div>
      {caption ? <span className={`${SKELETON_BAR} h-4 w-40`} aria-hidden="true" /> : null}
    </section>
  );
}
