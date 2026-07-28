/**
 * The normalized internal game model — the boundary contract.
 *
 * Everything downstream (engine, classifier, report, LLM payload) consumes
 * THIS, never a platform's raw shape. Lichess normalizes into it now; chess.com
 * must normalize into the same thing at P2 (FR-1). If a field only makes sense
 * for one platform, it does not belong here.
 *
 * Refs: US-B1, US-B2, US-C2, FR-1, FR-3, NFR-L1.
 */

export type Platform = "lichess" | "chesscom";

export type Color = "white" | "black";

/** Result from the subject player's point of view — not the winner's. */
export type SubjectResult = "win" | "loss" | "draw";

export type Speed = "ultraBullet" | "bullet" | "blitz" | "rapid" | "classical" | "correspondence";

/**
 * Where an evaluation came from (US-C2). Recorded per eval so a report can
 * explain itself and so we never re-run the engine on a position that already
 * has a trustworthy server eval.
 */
export type EvalProvenance = "lichess-server" | "local-engine" | "cloud";

/**
 * A position evaluation, always from **White's** point of view — the engine
 * convention. Positive favours White regardless of who moved.
 *
 * Exactly one of `cp` / `mate` is set. `mate` is signed: +3 = White mates in 3,
 * -2 = Black mates in 2. Treating mate as a large centipawn value breaks
 * win-probability maths at the extremes (US-C4), so the distinction is kept in
 * the type rather than flattened.
 */
export type PositionEval = {
  readonly cp?: number;
  readonly mate?: number;
  readonly provenance: EvalProvenance;
  readonly depth?: number;
};

export type NormalizedMove = {
  /** 1-based half-move number. Ply 1 is White's first move. */
  readonly ply: number;
  readonly san: string;
  /** Long algebraic ("e2e4", "e7e8q") — what the engine speaks. */
  readonly uci: string;
  readonly color: Color;
  /** Position the mover faced, before playing. */
  readonly fenBefore: string;
  /** Position after the move. */
  readonly fenAfter: string;
  /** Clock remaining after the move, centiseconds, when the platform reports it. */
  readonly clockCentis?: number;
  /** Eval of `fenAfter`. Filled by import (server evals) or by the engine (M3). */
  readonly evalAfter?: PositionEval;
};

export type PlayerInfo = {
  readonly username: string | null;
  readonly rating: number | null;
  /** Rating change for this game, when reported. */
  readonly ratingDiff: number | null;
  /** True when this seat is a bot/AI rather than a human. */
  readonly isBot: boolean;
};

export type TimeControl =
  | { readonly kind: "clock"; readonly initialSeconds: number; readonly incrementSeconds: number }
  | { readonly kind: "correspondence"; readonly daysPerTurn: number | null }
  | { readonly kind: "unlimited" };

export type Opening = {
  /** ECO code, e.g. "C50". */
  readonly eco: string | null;
  readonly name: string | null;
};

export type NormalizedGame = {
  readonly id: string;
  readonly platform: Platform;
  readonly url: string;
  /** ISO 8601. */
  readonly playedAt: string;
  readonly speed: Speed;
  readonly timeControl: TimeControl;
  readonly rated: boolean;
  readonly players: Readonly<Record<Color, PlayerInfo>>;

  /**
   * Whose report this is. Every "you" in the final report resolves through
   * this — get it wrong and the coaching is about the opponent.
   */
  readonly subject: {
    readonly username: string;
    readonly color: Color;
    readonly result: SubjectResult;
  };

  /** Platform's terminal status: "mate", "resign", "outoftime", "draw", … */
  readonly status: string;
  readonly winner: Color | null;
  readonly opening: Opening;
  /** Starting position — non-standard for variants/positions games. */
  readonly initialFen: string;
  readonly moves: readonly NormalizedMove[];

  /**
   * Literal `true`, never a boolean.
   *
   * NFR-L1 is the hardest line this product has: only finished games may enter
   * the analysis pipeline. Making this a literal type means a value that has
   * not been proven finished cannot be assigned to `NormalizedGame` at all —
   * the constraint is enforced by the compiler, not by remembering to check.
   */
  readonly finished: true;
};

/** Stable cache/idempotency key (FR-3). */
export function gameKey(game: Pick<NormalizedGame, "platform" | "id">): string {
  return `${game.platform}:${game.id}`;
}

export function opposite(color: Color): Color {
  return color === "white" ? "black" : "white";
}

/**
 * Sign multiplier to convert a White-POV eval into the given player's POV.
 * The single most common source of bugs in this domain — centralize it.
 */
export function perspective(color: Color): 1 | -1 {
  return color === "white" ? 1 : -1;
}
