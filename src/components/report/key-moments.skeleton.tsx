import {
  CHIP,
  MOMENT_CARD,
  MOMENT_TEXT_BLOCK,
  MOMENT_THUMB,
  SECTION,
  SECTION_HEADING,
  SKELETON_BAR,
} from "./report-geometry";

/**
 * Paired skeleton for `KeyMoments` (D-08).
 *
 * Reserves **the number of cards that will actually render**, defaulting to 3 —
 * the low end of US-D2's 3–5. Reserving 5 and rendering 3 would collapse the
 * page upward on load, which is a shift in the wrong direction and just as
 * costly as growing.
 */
export function KeyMomentsSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <section className={SECTION} aria-busy="true" role="status" aria-label="Loading key moments">
      <h2 className={SECTION_HEADING}>Key moments</h2>
      <ul className="flex flex-col gap-2">
        {Array.from({ length: cards }, (_, i) => (
          <li key={i}>
            <article className={MOMENT_CARD} aria-hidden="true">
              <span className={`${MOMENT_THUMB} ${SKELETON_BAR} block`} />
              <span className={MOMENT_TEXT_BLOCK}>
                <span className="flex items-center gap-1.5">
                  <span className={`${SKELETON_BAR} h-4 w-16`} />
                  <span className={`${CHIP} ${SKELETON_BAR}`} />
                </span>
                {/* Two text lines: matches the typical explanation length, so
                    the card height does not change when prose arrives. */}
                <span className={`${SKELETON_BAR} h-3 w-full`} />
                <span className={`${SKELETON_BAR} h-3 w-4/5`} />
                <span className={`${SKELETON_BAR} h-3 w-24`} />
              </span>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
