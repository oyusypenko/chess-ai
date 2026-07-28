import type { Color, PositionEval } from "@/model/game";
import { perspective } from "@/model/game";

/**
 * Centipawn evaluation → win probability (US-C4).
 *
 * **Why not classify on centipawns directly.** A 200 cp swing means completely
 * different things at different points on the scale: from +0 to +200 it is the
 * difference between a balanced game and a serious advantage; from +900 to
 * +1100 it changes essentially nothing, because the position was already won.
 * Centipawn thresholds therefore over-report "blunders" in decided positions
 * and under-report them in close ones — exactly backwards from what a coach
 * would say. Win probability normalizes the scale so a delta means the same
 * thing everywhere.
 *
 * **The model.** Standard logistic on centipawns:
 *
 *     P(win) = 1 / (1 + exp(-k · cp))
 *
 * `k` is chosen so that +100 cp ≈ 0.60 win probability, which matches the
 * usual "a pawn up is a meaningful but not winning edge" intuition at club
 * level. Deliberately simple and documented rather than a fitted curve with no
 * explanation: US-E2 requires the methodology be explainable, and every
 * threshold in `thresholds.ts` is expressed against this scale.
 *
 * Clean-room (NFR-L3, D-03): the *approach* follows publicly described
 * practice; no code was taken from any GPL project.
 */

/**
 * Logistic steepness. Derived, not guessed:
 *   0.60 = 1 / (1 + exp(-k · 100))  ⇒  k = ln(1.5) / 100 ≈ 0.0040546
 */
export const LOGISTIC_K = Math.log(1.5) / 100;

/** Beyond this the position is treated as decided; used to bound mate scores. */
export const DECISIVE_CP = 2000;

/**
 * Mate certainty band.
 *
 * Both bounds sit strictly inside the saturated centipawn probability
 * (1 − winProbabilityFromCp(DECISIVE_CP) ≈ 3.0e-4), so **any** mate outranks
 * **any** centipawn score. Within the band, shorter mates are nearer certainty.
 */
export const MATE_MARGIN_MIN = 1e-6;
export const MATE_MARGIN_MAX = 1e-4;

/**
 * Win probability for the side to move being *White*, in [0, 1].
 * Input is a White-POV centipawn score.
 */
export function winProbabilityFromCp(cp: number): number {
  const clamped = Math.max(-DECISIVE_CP, Math.min(DECISIVE_CP, cp));
  return 1 / (1 + Math.exp(-LOGISTIC_K * clamped));
}

/**
 * Win probability from a full eval, handling mate.
 *
 * Mate is not a large centipawn value — it is certainty. Mapping mate to a
 * probability asymptotically close to 0 or 1 (rather than exactly 0/1) keeps
 * the arithmetic well-behaved while preserving the ordering "mate in 1 is
 * better than mate in 8".
 */
export function winProbability(evaluation: PositionEval): number {
  if (evaluation.mate !== undefined) {
    if (evaluation.mate === 0) {
      // Mate on the board: whoever is to move has already been mated. Callers
      // that need the distinction use the game's terminal status.
      return 0.5;
    }
    const winning = evaluation.mate > 0; // White mates
    // Mate must outrank ANY centipawn score — it is certainty, not a big
    // number. The saturated cp score at ±DECISIVE_CP already reaches
    // ~0.99970, so mate margins must stay strictly inside that or a +19.00
    // evaluation would read as more winning than a forced mate.
    // Shorter mates sit marginally closer to certainty.
    const closeness = 1 / (Math.abs(evaluation.mate) + 1);
    const margin = MATE_MARGIN_MIN + (MATE_MARGIN_MAX - MATE_MARGIN_MIN) * (1 - closeness);
    return winning ? 1 - margin : margin;
  }
  if (evaluation.cp !== undefined) return winProbabilityFromCp(evaluation.cp);
  // No score at all — treat as balanced rather than throwing; a missing eval
  // must not take down a report.
  return 0.5;
}

/**
 * How much win probability the mover gave up, in [0, 1].
 *
 * `before` and `after` are both **White POV**. The result is expressed from
 * the **mover's** point of view: positive means the mover got worse. This is
 * where the sign convention finally resolves, and it is the single most
 * error-prone line in the classifier — hence one function, tested from both
 * colours, rather than the flip being repeated at each call site.
 */
export function winProbabilityLoss(
  before: PositionEval,
  after: PositionEval,
  mover: Color,
): number {
  const beforeWhite = winProbability(before);
  const afterWhite = winProbability(after);
  // White POV delta, negative when White got worse.
  const delta = afterWhite - beforeWhite;
  // Flip for Black so "loss" is always from the mover's side.
  const moverDelta = delta * perspective(mover);
  // A move cannot improve your own position relative to best play; clamp
  // small positive noise (engine non-determinism across depths) to zero.
  return Math.max(0, -moverDelta);
}

/** Accuracy-style score in [0, 100] for a single move — used in summaries. */
export function moveAccuracy(loss: number): number {
  return Math.round(100 * Math.exp(-4 * loss) * 100) / 100;
}
