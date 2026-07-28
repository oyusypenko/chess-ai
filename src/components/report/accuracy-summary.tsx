import type { GameClassification } from "@/classifier/classify-game";
import { CLASSIFICATION_META, type Classification } from "@/classifier/thresholds";
import { ClassificationChip } from "./classification-chip";
import { SECTION, SECTION_HEADING, SKELETON_BAR } from "./report-geometry";

/**
 * Move-quality tally for the subject player (US-G1, US-E1).
 *
 * Shows only categories that occurred — a row of zeroes teaches nothing and
 * costs vertical space we do not have at 360 px.
 */
const DISPLAY_ORDER: readonly Classification[] = [
  "brilliant",
  "best",
  "excellent",
  "good",
  "book",
  "inaccuracy",
  "mistake",
  "missedWin",
  "costly",
];

export function AccuracySummary({
  classification,
  subjectColor,
}: {
  classification: GameClassification;
  subjectColor: "white" | "black";
}) {
  const counts = classification.subjectCounts;
  const present = DISPLAY_ORDER.filter((c) => (counts[c] ?? 0) > 0);

  return (
    <section className={SECTION} aria-labelledby="accuracy-heading">
      <h2 id="accuracy-heading" className={SECTION_HEADING}>
        Your moves
      </h2>
      <div className="flex flex-col gap-2 rounded-lg border border-black/10 p-3 dark:border-white/15">
        <p className="text-sm">
          <span className="font-semibold tabular-nums">
            {classification.accuracy[subjectColor].toFixed(1)}
          </span>
          <span className="text-black/60 dark:text-white/60"> average accuracy</span>
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {present.map((c) => (
            <li key={c} className="flex items-center gap-1">
              <ClassificationChip classification={c} label={CLASSIFICATION_META[c].label} />
              <span className="text-xs tabular-nums text-black/60 dark:text-white/60">
                ×{counts[c]}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function AccuracySummarySkeleton() {
  return (
    <section className={SECTION} aria-busy="true" role="status" aria-label="Loading move quality">
      <h2 className={SECTION_HEADING}>Your moves</h2>
      <div
        className="flex flex-col gap-2 rounded-lg border border-black/10 p-3 dark:border-white/15"
        aria-hidden="true"
      >
        <span className={`${SKELETON_BAR} h-5 w-44`} />
        {/* Three chips, sized to the real chip width — four wrapped to a
            second line and over-reserved by 26px, which collapsed the page
            upward on load. Measured, not guessed. */}
        <span className="flex flex-wrap gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`${SKELETON_BAR} h-5 w-[4.75rem]`} />
          ))}
        </span>
      </div>
    </section>
  );
}
