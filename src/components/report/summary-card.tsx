import {
  SECTION,
  SECTION_HEADING,
  SKELETON_BAR,
  SUMMARY_BOX,
  SUMMARY_SKELETON_PARAGRAPHS,
} from "./report-geometry";

/**
 * The coaching summary (US-D1, NFR-R1).
 *
 * **All three states render in the same box** (`SUMMARY_BOX`, with a
 * `min-h`). That is not cosmetic: the "AI summary pending" degradation state is
 * shown whenever the provider is down, and if the box grew when real text
 * arrived, every recovery would shift the page. Same geometry, different
 * contents.
 *
 * `status` comes straight from the validated generator, so this component never
 * decides whether text is safe to show — by the time it arrives, it has already
 * passed the grounding validator or been stripped.
 */
export type SummaryState =
  | { kind: "loading" }
  | { kind: "ready"; text: string }
  /** Provider unavailable, or everything was stripped. Engine report still stands. */
  | { kind: "pending"; onRetry?: () => void };

export function SummaryCard({ state }: { state: SummaryState }) {
  return (
    <section className={SECTION} aria-labelledby="summary-heading">
      <h2 id="summary-heading" className={SECTION_HEADING}>
        Your review
      </h2>

      <div
        className={SUMMARY_BOX}
        aria-live="polite"
        aria-busy={state.kind === "loading"}
        {...(state.kind === "loading" ? { role: "status" } : {})}
      >
        {state.kind === "loading" ? (
          <div className="flex flex-col gap-3" aria-hidden="true">
            {/* Grouped as paragraphs with the same gap the loaded text uses, so
                the swap changes nothing. Widths approximate real prose. */}
            {SUMMARY_SKELETON_PARAGRAPHS.map((lines, p) => (
              <div key={p} className="flex flex-col gap-2">
                {lines.map((w, i) => (
                  <span key={i} className={`${SKELETON_BAR} block h-3.5 ${w}`} />
                ))}
              </div>
            ))}
          </div>
        ) : state.kind === "ready" ? (
          <div className="flex flex-col gap-3 text-sm leading-relaxed">
            {state.text
              .split(/\n{2,}/)
              .map((p) => p.trim())
              .filter(Boolean)
              .map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2 text-sm">
            <p className="text-black/70 dark:text-white/70">
              The written review isn&rsquo;t available right now. Everything else on this page —
              your move quality, the evaluation graph, and the key moments — comes from the engine
              and is complete.
            </p>
            {state.onRetry ? (
              <button
                type="button"
                onClick={state.onRetry}
                className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium dark:border-white/20"
              >
                Try again
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

/** Server-safe skeleton for Suspense fallbacks. */
export function SummaryCardSkeleton() {
  return <SummaryCard state={{ kind: "loading" }} />;
}
