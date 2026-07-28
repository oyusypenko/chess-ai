import type { NormalizedGame, PositionEval } from "@/model/game";

/**
 * Decide which positions actually need the engine (US-C1, US-C2).
 *
 * Pure and separate from the worker so the decision that dominates our p75
 * budget (NFR-P2) is unit-testable without WASM. On an analyzed Lichess game
 * this can eliminate nearly all engine work — it is the single biggest lever we
 * have on "≤ 45 s for a 40-move game".
 */

export type AnalysisTarget = {
  /** Ply whose resulting position needs evaluating; 0 = the starting position. */
  readonly ply: number;
  readonly fen: string;
};

export type AnalysisPlan = {
  /** Positions the engine must actually search. */
  readonly targets: readonly AnalysisTarget[];
  /** Evals we already have, keyed by ply (US-C2 reuse). */
  readonly reused: ReadonlyMap<number, PositionEval>;
  /** Every position that will end up with an eval — drives progress reporting. */
  readonly totalPositions: number;
};

/**
 * A reused eval must be trustworthy, not merely present.
 *
 * Lichess server evals come from a real analysis run, so we accept them. We do
 * NOT accept a shallow local eval from an interrupted earlier run: reusing a
 * depth-4 number as if it were a depth-18 one would silently corrupt
 * classification, and a wrong label is worse than a slow report.
 */
export function isReusable(evaluation: PositionEval | undefined, minDepth: number): boolean {
  if (!evaluation) return false;
  if (evaluation.provenance === "lichess-server") return true;
  if (evaluation.depth === undefined) return false;
  return evaluation.depth >= minDepth;
}

/**
 * Build the work plan for a game.
 *
 * The starting position is included: classifying move 1 needs an eval of the
 * position *before* it, and no move produced that position.
 */
export function planAnalysis(
  game: NormalizedGame,
  options: { minReuseDepth?: number } = {},
): AnalysisPlan {
  const minReuseDepth = options.minReuseDepth ?? 18;

  const targets: AnalysisTarget[] = [];
  const reused = new Map<number, PositionEval>();

  // Ply 0 — the position before White's first move.
  targets.push({ ply: 0, fen: game.initialFen });

  for (const move of game.moves) {
    if (isReusable(move.evalAfter, minReuseDepth)) {
      // Non-null: isReusable already rejected undefined.
      reused.set(move.ply, move.evalAfter as PositionEval);
    } else {
      targets.push({ ply: move.ply, fen: move.fenAfter });
    }
  }

  return {
    targets,
    reused,
    // +1 for the starting position.
    totalPositions: game.moves.length + 1,
  };
}

/**
 * How much engine work the plan avoided, as a fraction in [0, 1].
 * Surfaced so the p75 budget can be reasoned about from real data rather than
 * assumption (NFR-P2).
 */
export function reuseRatio(plan: AnalysisPlan): number {
  if (plan.totalPositions === 0) return 0;
  return plan.reused.size / plan.totalPositions;
}
