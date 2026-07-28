import type { NormalizedGame } from "@/model/game";
import type { GameClassification, ClassifiedMove } from "@/classifier/classify-game";
import { selectKeyMoments } from "@/classifier/classify-game";
import type { Classification } from "@/classifier/thresholds";

/**
 * Build the LLM input from engine + classifier output (US-D1).
 *
 * **This function is the engine-first principle made concrete.** Whatever it
 * puts in is what the model is allowed to talk about; whatever it leaves out
 * cannot be mentioned without the grounding validator catching it. So it
 * carries *facts already computed* — never raw positions for the model to
 * assess, and never anything asking for a judgement.
 *
 * It also carries no personal data (NFR-PR1): no emails, no account IDs. The
 * usernames are public game data and are omitted anyway because the review
 * addresses the player as "you".
 */

export type KeyMomentPayload = {
  readonly ply: number;
  /** Human move number — what a player would say. */
  readonly moveNumber: number;
  readonly color: "white" | "black";
  readonly san: string;
  readonly label: string;
  readonly description: string;
  /** Engine's preference in SAN, when we could resolve it. */
  readonly bestSan?: string;
  readonly phase: "opening" | "middlegame" | "endgame";
  readonly lowClock: boolean;
};

export type ReportPayload = {
  readonly subjectColor: "white" | "black";
  readonly result: string;
  readonly timeControl: string;
  readonly opening?: string;
  readonly subjectRating: number | null;
  readonly opponentRating: number | null;
  readonly accuracy: number;
  readonly counts: Readonly<Partial<Record<Classification, number>>>;
  readonly keyMoments: readonly KeyMomentPayload[];
  readonly timeTrouble: boolean;
};

/** Below this share of starting time, a move counts as made in time trouble. */
const LOW_CLOCK_FRACTION = 0.15;

export function buildReportPayload(
  game: NormalizedGame,
  classification: GameClassification,
  options: { keyMomentLimit?: number } = {},
): ReportPayload {
  const subjectColor = game.subject.color;
  const opponentColor = subjectColor === "white" ? "black" : "white";

  const keyMoves = selectKeyMoments(classification, subjectColor, options.keyMomentLimit ?? 5);
  const totalPlies = game.moves.length;

  const initialCentis =
    game.timeControl.kind === "clock" ? game.timeControl.initialSeconds * 100 : null;

  const keyMoments = keyMoves.map((move) => toKeyMoment(move, totalPlies, initialCentis));

  return {
    subjectColor,
    result: game.subject.result,
    timeControl: describeTimeControl(game),
    opening: game.opening.name ?? undefined,
    subjectRating: game.players[subjectColor].rating,
    opponentRating: game.players[opponentColor].rating,
    accuracy: classification.accuracy[subjectColor],
    counts: classification.subjectCounts,
    keyMoments,
    // Only claim time trouble when it is actually a pattern, not one instance.
    timeTrouble:
      keyMoments.length > 0 &&
      keyMoments.filter((m) => m.lowClock).length >= Math.ceil(keyMoments.length / 2),
  };
}

function toKeyMoment(
  move: ClassifiedMove,
  totalPlies: number,
  initialCentis: number | null,
): KeyMomentPayload {
  return {
    ply: move.ply,
    // Ply 1 and 2 are both "move 1" as a player counts.
    moveNumber: Math.ceil(move.ply / 2),
    color: move.color,
    san: move.san,
    label: move.label,
    description: move.description,
    bestSan: move.bestMove,
    phase: phaseOf(move.ply, totalPlies),
    lowClock:
      initialCentis !== null &&
      move.clockCentis !== undefined &&
      move.clockCentis < initialCentis * LOW_CLOCK_FRACTION,
  };
}

/**
 * Game phase by ply.
 *
 * A crude split, and honestly labelled as such: real phase detection needs
 * material and structure. It is good enough to say "this happened in the
 * opening", which is all the review claims.
 */
export function phaseOf(ply: number, totalPlies: number): "opening" | "middlegame" | "endgame" {
  if (ply <= 20) return "opening";
  if (totalPlies > 0 && ply > totalPlies - 20) return "endgame";
  return "middlegame";
}

function describeTimeControl(game: NormalizedGame): string {
  const tc = game.timeControl;
  if (tc.kind === "clock") {
    const minutes = Math.round(tc.initialSeconds / 60);
    return `${minutes}+${tc.incrementSeconds} (${game.speed})`;
  }
  if (tc.kind === "correspondence") {
    return tc.daysPerTurn ? `correspondence, ${tc.daysPerTurn} days/move` : "correspondence";
  }
  return "unlimited";
}
