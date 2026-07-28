import type { Classification } from "@/classifier/thresholds";
import { CHIP } from "./report-geometry";

/**
 * Classification badge (US-C4, NFR-C2, NFR-L2).
 *
 * Original naming and styling — never chess.com's glyph designs or badge
 * branding (NFR-L2).
 *
 * **Meaning is never carried by colour alone.** A colour-blind user must get
 * the same information, so every chip shows its text label and the colour is
 * redundant reinforcement. Fixed width (see CHIP) so the move list does not
 * reflow as classifications resolve.
 */

const TONE: Record<Classification, string> = {
  best: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300",
  excellent: "bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
  good: "bg-black/5 text-black/70 dark:bg-white/10 dark:text-white/70",
  book: "bg-sky-600/10 text-sky-800 dark:text-sky-300",
  brilliant: "bg-violet-600/15 text-violet-800 dark:text-violet-300",
  inaccuracy: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  mistake: "bg-orange-600/15 text-orange-800 dark:text-orange-300",
  missedWin: "bg-orange-600/15 text-orange-800 dark:text-orange-300",
  costly: "bg-red-600/15 text-red-800 dark:text-red-300",
};

export function ClassificationChip({
  classification,
  label,
}: {
  classification: Classification;
  label: string;
}) {
  return (
    <span className={`${CHIP} ${TONE[classification]}`} data-classification={classification}>
      {label}
    </span>
  );
}
