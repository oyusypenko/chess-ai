/**
 * The subset of Lichess's game-export JSON we actually consume.
 *
 * Hand-written rather than generated: we depend on a handful of fields, and a
 * narrow type makes it obvious when the API adds something we are ignoring.
 * Everything is optional because the export shape varies with query params and
 * with what the platform recorded for that game.
 *
 * Source: https://lichess.org/api#tag/Games/operation/apiGamesUser
 */

export type LichessPlayerSide = {
  user?: { name?: string; id?: string; title?: string };
  rating?: number;
  ratingDiff?: number;
  aiLevel?: number;
};

export type LichessAnalysisEntry = {
  /** Centipawns from White's POV. */
  eval?: number;
  /** Mate in N, signed. */
  mate?: number;
  /** Present when Lichess flagged the move; we compute our own (US-C4). */
  judgment?: { name?: string; comment?: string };
  best?: string;
  variation?: string;
};

export type LichessGame = {
  id?: string;
  rated?: boolean;
  variant?: string;
  speed?: string;
  perf?: string;
  createdAt?: number;
  lastMoveAt?: number;
  /** "created" | "started" | "mate" | "resign" | "outoftime" | "draw" | … */
  status?: string;
  players?: { white?: LichessPlayerSide; black?: LichessPlayerSide };
  winner?: "white" | "black";
  opening?: { eco?: string; name?: string; ply?: number };
  /** Space-separated SAN, e.g. "e4 e5 Nf3". Present when `moves=true`. */
  moves?: string;
  /** Centiseconds remaining after each half-move. Present when `clocks=true`. */
  clocks?: number[];
  /** Per-ply server evals. Present when `evals=true` AND the game was analyzed. */
  analysis?: LichessAnalysisEntry[];
  clock?: { initial?: number; increment?: number; totalTime?: number };
  daysPerTurn?: number;
  initialFen?: string;
  pgn?: string;
};

/**
 * Statuses that mean the game is over.
 *
 * NFR-L1 depends on this list: anything not here is treated as unfinished and
 * refused. Deliberately an allow-list, not a deny-list — a status we have never
 * seen must fail closed, not slip into the pipeline.
 */
export const FINISHED_STATUSES: ReadonlySet<string> = new Set([
  "mate",
  "resign",
  "stalemate",
  "timeout",
  "draw",
  "outoftime",
  "cheat",
  "noStart",
  "unknownFinish",
  "variantEnd",
]);

export function isFinished(status: string | undefined): boolean {
  return status !== undefined && FINISHED_STATUSES.has(status);
}
