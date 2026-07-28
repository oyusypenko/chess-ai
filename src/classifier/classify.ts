import { Chess } from "chess.js";
import type { Color, PositionEval } from "@/model/game";
import { winProbability, winProbabilityLoss, moveAccuracy } from "./win-probability";
import {
  CLASSIFICATION_META,
  LOSS_BANDS,
  LOSS_THRESHOLDS,
  PIECE_VALUES,
  SPECIAL,
  type Classification,
} from "./thresholds";

/**
 * Deterministic move classification (US-C4).
 *
 * **Pure by contract**: same (position, played move, evals) → same label, every
 * time. No randomness, no clock, no I/O, no engine re-query. The write-time
 * hook enforces this for the directory; the determinism test enforces it for
 * behaviour.
 *
 * Clean-room (NFR-L3, D-03): methodology re-implemented from public
 * description, no code copied from WintrChess/freechess.
 */

export type ClassifyInput = {
  /** Position the mover faced. */
  readonly fenBefore: string;
  /** Position after the move. */
  readonly fenAfter: string;
  /** The move played, SAN. */
  readonly san: string;
  readonly mover: Color;
  /** Eval of `fenBefore` (White POV). */
  readonly evalBefore: PositionEval | undefined;
  /** Eval of `fenAfter` (White POV). */
  readonly evalAfter: PositionEval | undefined;
  /** Engine's preferred line from `fenBefore`, UCI. First entry is the best move. */
  readonly bestLine?: readonly string[];
  /** True while still in known opening theory. */
  readonly isBook?: boolean;
};

export type MoveClassification = {
  readonly classification: Classification;
  readonly label: string;
  readonly description: string;
  readonly severity: 0 | 1 | 2 | 3;
  /** Win probability the mover gave up, [0, 1]. */
  readonly loss: number;
  /** Per-move accuracy in [0, 100]. */
  readonly accuracy: number;
  /** Engine's preferred move in UCI, when known. */
  readonly bestMove?: string;
  /** True when the played move matched the engine's first choice. */
  readonly playedBest: boolean;
};

/**
 * Classify a single move.
 *
 * Order matters: the special categories (brilliant, missed win) are checked
 * before the loss ladder, because they describe *why* a move matters in a way
 * a bare threshold cannot.
 */
export function classifyMove(input: ClassifyInput): MoveClassification {
  const { evalBefore, evalAfter, mover, isBook } = input;

  const bestMove = input.bestLine?.[0];
  const playedBest = bestMove !== undefined && uciOf(input) === bestMove;

  // Without both evals we cannot claim anything about the move. Report it as
  // "good" with zero loss rather than inventing a judgement — a confident wrong
  // label is worse than a neutral one.
  if (!evalBefore || !evalAfter) {
    return build("good", 0, playedBest, bestMove);
  }

  const loss = winProbabilityLoss(evalBefore, evalAfter, mover);

  if (isBook) return build("book", loss, playedBest, bestMove);

  if (isBrilliant(input, loss)) return build("brilliant", loss, playedBest, bestMove);

  if (isMissedWin(evalBefore, evalAfter, mover, loss)) {
    return build("missedWin", loss, playedBest, bestMove);
  }

  return build(classifyByLoss(loss, playedBest), loss, playedBest, bestMove);
}

/**
 * The loss ladder — walk the bands and take the last one reached.
 *
 * Bounds are inclusive at the lower end, so a loss of exactly a boundary lands
 * in the more severe band. That is a deliberate, documented tie-break: US-C4
 * requires a deterministic classifier, and "exactly on the line" must resolve
 * one way, always.
 *
 * Playing the engine's top move is `best` regardless of computed loss — any
 * residual there is engine noise across depths, not a real error by the player.
 */
export function classifyByLoss(loss: number, playedBest = false): Classification {
  if (playedBest) return "best";
  let result: Classification = LOSS_BANDS[0].classification;
  for (const band of LOSS_BANDS) {
    if (loss >= band.min) result = band.classification;
    else break;
  }
  return result;
}

/**
 * A win is "missed" only when the position was genuinely winning and is not
 * any more. Firing on any large loss would relabel half of all mistakes.
 */
function isMissedWin(
  before: PositionEval,
  after: PositionEval,
  mover: Color,
  loss: number,
): boolean {
  if (loss < LOSS_THRESHOLDS.inaccuracy) return false;
  const beforeMover = moverWinProbability(before, mover);
  const afterMover = moverWinProbability(after, mover);
  return beforeMover >= SPECIAL.missedWinBefore && afterMover < SPECIAL.missedWinAfter;
}

/**
 * Brilliant = a genuine material sacrifice that is still (near-)best.
 *
 * Deliberately hard to earn. Requires: real material given up, the move still
 * essentially best, and the position not already winning — otherwise every
 * routine exchange sacrifice in a won game would light up, and the badge would
 * stop meaning anything.
 */
function isBrilliant(input: ClassifyInput, loss: number): boolean {
  if (loss > SPECIAL.brilliantMaxLoss) return false;
  if (!input.evalBefore) return false;
  if (moverWinProbability(input.evalBefore, input.mover) > SPECIAL.brilliantMaxWinProbBefore) {
    return false;
  }
  return (
    materialSacrificed(input.fenBefore, input.fenAfter, input.san) >=
    SPECIAL.brilliantMinSacrificeCp
  );
}

/** Win probability from the mover's point of view. */
function moverWinProbability(evaluation: PositionEval, mover: Color): number {
  const white = winProbability(evaluation);
  return mover === "white" ? white : 1 - white;
}

/**
 * Material the mover is *offering*, in centipawns.
 *
 * **Comparing material before and after the move does not work**, and the
 * reason is the whole subtlety of sacrifice detection: a sacrifice has not been
 * accepted yet. After `Nxf7`, White is a pawn *up* on the board — the knight is
 * still standing there. The sacrifice is that it can be taken next move.
 *
 * So we ask the right question instead: does the mover leave material en prise?
 *   1. Net offered = value(piece moved) − value(piece captured).
 *   2. The opponent must actually be able to capture it on its new square.
 *   3. The cheapest attacker must be worth less than the piece offered —
 *      otherwise it is an even trade, not a sacrifice.
 *
 * Deliberately conservative. "Brilliant" that fires on routine recaptures is
 * worse than one that occasionally misses, because a badge everyone earns
 * teaches nothing.
 */
export function materialSacrificed(fenBefore: string, fenAfter: string, san: string): number {
  let movedPiece: string;
  let capturedPiece: string | undefined;
  let destination: string;

  try {
    const chess = new Chess(fenBefore);
    const move = chess.move(san);
    if (!move) return 0;
    movedPiece = move.piece;
    capturedPiece = move.captured;
    destination = move.to;
  } catch {
    return 0;
  }

  const offered =
    (PIECE_VALUES[movedPiece] ?? 0) - (capturedPiece ? PIECE_VALUES[capturedPiece] : 0);
  if (offered <= 0) return 0;

  // Can the opponent take it, and is taking it a material win for them?
  let cheapestAttacker = Infinity;
  try {
    const after = new Chess(fenAfter);
    for (const reply of after.moves({ verbose: true })) {
      if (reply.to !== destination || !reply.captured) continue;
      cheapestAttacker = Math.min(cheapestAttacker, PIECE_VALUES[reply.piece] ?? 0);
    }
  } catch {
    return 0;
  }

  if (cheapestAttacker === Infinity) return 0; // nothing attacks it — not offered
  if (cheapestAttacker >= (PIECE_VALUES[movedPiece] ?? 0)) return 0; // even trade at best

  return offered;
}

/** Resolve the played SAN to UCI so it can be compared with the engine line. */
function uciOf(input: ClassifyInput): string | undefined {
  try {
    const chess = new Chess(input.fenBefore);
    const move = chess.move(input.san);
    return move ? `${move.from}${move.to}${move.promotion ?? ""}` : undefined;
  } catch {
    return undefined;
  }
}

function build(
  classification: Classification,
  loss: number,
  playedBest: boolean,
  bestMove: string | undefined,
): MoveClassification {
  const meta = CLASSIFICATION_META[classification];
  return {
    classification,
    label: meta.label,
    description: meta.description,
    severity: meta.severity,
    loss,
    accuracy: moveAccuracy(loss),
    bestMove,
    playedBest,
  };
}

export { CLASSIFICATION_META, type Classification };
