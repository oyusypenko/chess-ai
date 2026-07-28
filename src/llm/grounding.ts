import { Chess } from "chess.js";
import type { NormalizedGame } from "@/model/game";

/**
 * The grounding validator (US-D1) — the hard gate between the model and the user.
 *
 * **A hallucinated move must never render.** This is the single guarantee that
 * makes an LLM acceptable in a chess product at all: the engine produces the
 * facts, the model narrates them, and anything the model says that is not
 * traceable to those facts is removed before anyone sees it.
 *
 * The check is deliberately *syntactic and total*, not clever: extract every
 * move-like and square-like token from the generated prose and require each one
 * to appear in the actual game or in an engine line we computed. A validator
 * that tries to understand the sentence would have its own failure modes; this
 * one only has false positives (over-strict), which fail safe.
 *
 * Flow required by US-D1: mismatch → regenerate **once** → then strip the
 * offending sentences.
 */

/**
 * Standard Algebraic Notation.
 *
 * Anchored with word boundaries and requiring the shapes SAN actually takes, so
 * ordinary prose does not trip it. Matches: e4, exd5, e8=Q, exd8=Q+, Nf3, Nbd2,
 * N1f3, Nxf7, Qxd8#, O-O, O-O-O.
 */
const SAN_PATTERN =
  /\b(?:O-O-O|O-O|(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x?[a-h]?[1-8](?:=[QRBN])?))[+#]?\b/g;

/** A bare square reference such as "e4" or "h7". */
const SQUARE_PATTERN = /\b[a-h][1-8]\b/g;

export type GroundingFacts = {
  /** Every SAN actually played, normalized (no +/# suffix). */
  readonly playedSans: ReadonlySet<string>;
  /** Every SAN the engine offered as an alternative, normalized. */
  readonly engineSans: ReadonlySet<string>;
  /** Every square touched by a played or engine-suggested move. */
  readonly squares: ReadonlySet<string>;
};

export type GroundingIssue = {
  readonly token: string;
  readonly kind: "move" | "square";
  readonly sentence: string;
};

export type GroundingResult = {
  readonly ok: boolean;
  readonly issues: readonly GroundingIssue[];
  /** The text with unsupported sentences removed. Equals input when `ok`. */
  readonly cleanedText: string;
  /** Sentences dropped, for logging — never shown to the user. */
  readonly droppedSentences: readonly string[];
};

/**
 * Build the set of facts the model is allowed to reference.
 *
 * Engine lines are converted from UCI to SAN by replaying them, because the
 * model writes SAN and comparing notations directly would reject every correct
 * reference to an engine suggestion.
 */
export function buildGroundingFacts(
  game: NormalizedGame,
  engineLines?: ReadonlyMap<number, readonly string[]>,
): GroundingFacts {
  const playedSans = new Set<string>();
  const engineSans = new Set<string>();
  const squares = new Set<string>();

  for (const move of game.moves) {
    playedSans.add(normalizeSan(move.san));
    squares.add(move.uci.slice(0, 2));
    squares.add(move.uci.slice(2, 4));
  }

  if (engineLines) {
    for (const [ply, line] of engineLines) {
      // The line starts from the position at `ply`, i.e. after that ply's move.
      const startFen =
        ply === 0 ? game.initialFen : game.moves.find((m) => m.ply === ply)?.fenAfter;
      if (!startFen) continue;

      let chess: Chess;
      try {
        chess = new Chess(startFen);
      } catch {
        continue;
      }

      for (const uci of line) {
        squares.add(uci.slice(0, 2));
        squares.add(uci.slice(2, 4));
        try {
          const applied = chess.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci[4],
          });
          if (!applied) break;
          engineSans.add(normalizeSan(applied.san));
        } catch {
          break;
        }
      }
    }
  }

  return { playedSans, engineSans, squares };
}

/**
 * Validate generated prose against the facts.
 *
 * Returns both the verdict and a cleaned version. Callers use the verdict to
 * decide whether to regenerate, and the cleaned text as the last resort.
 */
export function validateGrounding(text: string, facts: GroundingFacts): GroundingResult {
  const sentences = splitSentences(text);
  const issues: GroundingIssue[] = [];
  const kept: string[] = [];
  const dropped: string[] = [];

  for (const sentence of sentences) {
    const sentenceIssues = checkSentence(sentence, facts);
    if (sentenceIssues.length > 0) {
      issues.push(...sentenceIssues);
      dropped.push(sentence);
    } else {
      kept.push(sentence);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    cleanedText: kept.join(" ").replace(/\s+/g, " ").trim(),
    droppedSentences: dropped,
  };
}

function checkSentence(sentence: string, facts: GroundingFacts): GroundingIssue[] {
  const issues: GroundingIssue[] = [];

  for (const raw of sentence.match(SAN_PATTERN) ?? []) {
    const san = normalizeSan(raw);
    if (!facts.playedSans.has(san) && !facts.engineSans.has(san)) {
      issues.push({ token: raw, kind: "move", sentence });
    }
  }

  for (const square of sentence.match(SQUARE_PATTERN) ?? []) {
    // A square inside a SAN token was already checked as part of that move.
    if (facts.squares.has(square)) continue;
    // Avoid double-reporting a square that is part of a move we already flagged.
    if (issues.some((issue) => issue.token.includes(square))) continue;
    issues.push({ token: square, kind: "square", sentence });
  }

  return issues;
}

/** Strip check/mate markers and the `x` capture marker for comparison. */
function normalizeSan(san: string): string {
  return san
    .replace(/[+#!?]/g, "")
    .replace(/^0-0-0$/, "O-O-O")
    .replace(/^0-0$/, "O-O");
}

/**
 * Split into sentences.
 *
 * Kept simple on purpose: chess prose contains "1." and "e4." which a
 * general-purpose splitter mishandles. We break on sentence-ending punctuation
 * followed by whitespace and a capital letter, which is good enough to isolate
 * a bad claim without shredding the text.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}
