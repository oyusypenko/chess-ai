import { EVAL_GRAPH_HEIGHT, SECTION, SECTION_HEADING } from "./report-geometry";

/**
 * Paired skeleton for `EvalGraph` (D-08).
 *
 * Deliberately renders the **axis and the container**, not a pulsing bar: the
 * loaded graph's box is exactly this, and the only thing that appears later is
 * the line inside it. Reserving the full height with the equality line already
 * drawn means the swap changes zero geometry.
 */
export function EvalGraphSkeleton() {
  return (
    <section className={SECTION} aria-busy="true" role="status" aria-label="Loading evaluation">
      <h2 className={SECTION_HEADING}>Evaluation</h2>
      <div
        className={`${EVAL_GRAPH_HEIGHT} relative overflow-hidden rounded-lg border border-black/10 bg-black/[0.03] dark:border-white/15 dark:bg-white/[0.04]`}
      >
        <svg
          viewBox="0 0 100 40"
          preserveAspectRatio="none"
          className="h-full w-full motion-safe:animate-pulse"
          aria-hidden="true"
        >
          <line
            x1="0"
            y1="20"
            x2="100"
            y2="20"
            className="stroke-black/20 dark:stroke-white/25"
            strokeWidth="0.3"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    </section>
  );
}
