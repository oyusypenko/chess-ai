import type { NormalizedGame, PositionEval } from "@/model/game";
import { classifyMove, type MoveClassification } from "./classify";
import type { Classification } from "./thresholds";

/**
 * Apply the classifier across a whole game (US-C4, US-D2, US-E1).
 *
 * Pure: takes the game plus the analysis produced in M3 and returns labels. No
 * engine, no I/O — so the same input always yields the same report.
 */

export type ClassifiedMove = MoveClassification & {
  readonly ply: number;
  readonly san: string;
  readonly color: "white" | "black";
  readonly fenBefore: string;
  readonly fenAfter: string;
  readonly clockCentis?: number;
};

export type GameClassification = {
  readonly moves: readonly ClassifiedMove[];
  /** Counts per category for the subject player only. */
  readonly subjectCounts: Readonly<Record<Classification, number>>;
  /** Mean per-move accuracy for each side, [0, 100]. */
  readonly accuracy: Readonly<Record<"white" | "black", number>>;
};

export type ClassifyGameInput = {
  readonly game: NormalizedGame;
  /** Eval per ply from M3; ply 0 is the starting position. */
  readonly evals: ReadonlyMap<number, PositionEval>;
  /** Engine best line per ply, UCI. */
  readonly bestLines?: ReadonlyMap<number, readonly string[]>;
  /**
   * Plies still in opening theory. Supplied by the caller because "book" is a
   * database question, not an engine one — until we have that database, callers
   * pass an empty set and no move is labelled book.
   */
  readonly bookPlies?: ReadonlySet<number>;
};

export function classifyGame(input: ClassifyGameInput): GameClassification {
  const { game, evals, bestLines, bookPlies } = input;

  const moves: ClassifiedMove[] = game.moves.map((move) => {
    // The eval BEFORE a move is the eval of the previous ply's position.
    // Ply 1's "before" is ply 0, the starting position — which is why M3
    // always evaluates it.
    const evalBefore = evals.get(move.ply - 1);
    const evalAfter = evals.get(move.ply);

    const classification = classifyMove({
      fenBefore: move.fenBefore,
      fenAfter: move.fenAfter,
      san: move.san,
      mover: move.color,
      evalBefore,
      evalAfter,
      bestLine: bestLines?.get(move.ply - 1),
      isBook: bookPlies?.has(move.ply),
    });

    return {
      ...classification,
      ply: move.ply,
      san: move.san,
      color: move.color,
      fenBefore: move.fenBefore,
      fenAfter: move.fenAfter,
      clockCentis: move.clockCentis,
    };
  });

  return {
    moves,
    subjectCounts: countBy(moves.filter((m) => m.color === game.subject.color)),
    accuracy: {
      white: meanAccuracy(moves.filter((m) => m.color === "white")),
      black: meanAccuracy(moves.filter((m) => m.color === "black")),
    },
  };
}

/**
 * Select the moves worth showing (US-D2: 3–5 key moments).
 *
 * Ranked by how much the move actually cost, restricted to the subject player —
 * a report about your game should not spend its space on your opponent's
 * mistakes. Ties break by earlier ply so the output is deterministic.
 */
export function selectKeyMoments(
  classified: GameClassification,
  subjectColor: "white" | "black",
  limit = 5,
): readonly ClassifiedMove[] {
  return [...classified.moves]
    .filter((m) => m.color === subjectColor)
    .filter((m) => m.severity > 0 || m.classification === "brilliant")
    .sort((a, b) => b.loss - a.loss || a.ply - b.ply)
    .slice(0, limit);
}

function countBy(moves: readonly ClassifiedMove[]): Record<Classification, number> {
  const counts = {} as Record<Classification, number>;
  for (const move of moves) {
    counts[move.classification] = (counts[move.classification] ?? 0) + 1;
  }
  return counts;
}

function meanAccuracy(moves: readonly ClassifiedMove[]): number {
  if (moves.length === 0) return 100;
  const total = moves.reduce((sum, m) => sum + m.accuracy, 0);
  return Math.round((total / moves.length) * 100) / 100;
}
