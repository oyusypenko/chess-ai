import type { Color, PositionEval } from "@/model/game";

/**
 * UCI protocol: command building and `info` line parsing.
 *
 * Deliberately pure and free of any WASM/worker dependency so the part most
 * likely to be subtly wrong — score sign handling — is unit-testable without a
 * browser.
 *
 * ⚠️ **The single most important fact in this file:** UCI `score cp` and
 * `score mate` are reported from the **side to move's** point of view, while
 * our `PositionEval` is always **White's** point of view (see `src/model/game`).
 * Every score therefore needs a sign flip when Black is to move. Getting this
 * wrong inverts the evaluation of every second position, which would make the
 * classifier confidently label Black's best moves as blunders.
 *
 * Ref: https://official-stockfish.github.io/docs/stockfish-wiki/UCI-&-Commands.html
 */

export type UciInfo = {
  readonly depth?: number;
  readonly seldepth?: number;
  readonly nodes?: number;
  readonly nps?: number;
  readonly timeMs?: number;
  readonly multipv?: number;
  /** Centipawns, **White POV** — already sign-corrected. */
  readonly cp?: number;
  /** Mate in N, **White POV**, signed. */
  readonly mate?: number;
  /** Score bound when the search was cut off; a bounded score is not exact. */
  readonly bound?: "lower" | "upper";
  /** Principal variation in UCI long algebraic. */
  readonly pv?: readonly string[];
};

export type UciBestMove = {
  readonly bestmove: string | null;
  readonly ponder?: string;
};

/** Side to move, read from a FEN. Needed to sign-correct scores. */
export function sideToMove(fen: string): Color {
  return fen.split(/\s+/)[1] === "b" ? "black" : "white";
}

/**
 * Parse a single `info` line.
 *
 * Returns `null` for lines with no evaluation content (e.g. `info string …`,
 * or `currmove` progress chatter), so callers can ignore them without
 * inspecting the raw text.
 */
export function parseInfoLine(line: string, stm: Color): UciInfo | null {
  if (!line.startsWith("info ")) return null;
  // `info string …` is free-form logging, never an evaluation.
  if (line.startsWith("info string")) return null;

  const tokens = line.split(/\s+/);
  const info: {
    depth?: number;
    seldepth?: number;
    nodes?: number;
    nps?: number;
    timeMs?: number;
    multipv?: number;
    cp?: number;
    mate?: number;
    bound?: "lower" | "upper";
    pv?: string[];
  } = {};

  // Black to move → flip so the result is White POV.
  const flip = stm === "black" ? -1 : 1;
  let sawScore = false;

  for (let i = 1; i < tokens.length; i += 1) {
    switch (tokens[i]) {
      case "depth":
        info.depth = toInt(tokens[++i]);
        break;
      case "seldepth":
        info.seldepth = toInt(tokens[++i]);
        break;
      case "nodes":
        info.nodes = toInt(tokens[++i]);
        break;
      case "nps":
        info.nps = toInt(tokens[++i]);
        break;
      case "time":
        info.timeMs = toInt(tokens[++i]);
        break;
      case "multipv":
        info.multipv = toInt(tokens[++i]);
        break;
      case "score": {
        const kind = tokens[++i];
        const value = toInt(tokens[++i]);
        if (value === undefined) break;
        if (kind === "cp") {
          info.cp = value * flip;
          sawScore = true;
        } else if (kind === "mate") {
          info.mate = value * flip;
          sawScore = true;
        }
        // A bound may follow the score value.
        if (tokens[i + 1] === "lowerbound") {
          info.bound = "lower";
          i += 1;
        } else if (tokens[i + 1] === "upperbound") {
          info.bound = "upper";
          i += 1;
        }
        break;
      }
      case "pv":
        // `pv` is always last — everything after it is the line.
        info.pv = tokens.slice(i + 1).filter(Boolean);
        i = tokens.length;
        break;
      default:
        break;
    }
  }

  // A line with no score and no pv tells us nothing worth keeping.
  if (!sawScore && !info.pv && info.depth === undefined) return null;
  return info;
}

export function parseBestMove(line: string): UciBestMove | null {
  if (!line.startsWith("bestmove")) return null;
  const tokens = line.split(/\s+/);
  const move = tokens[1];
  // Stockfish emits `bestmove (none)` in terminal positions (mate/stalemate).
  const bestmove = !move || move === "(none)" ? null : move;
  const ponderIndex = tokens.indexOf("ponder");
  return {
    bestmove,
    ponder: ponderIndex >= 0 ? tokens[ponderIndex + 1] : undefined,
  };
}

/** Convert a parsed info into our stored eval shape (US-C2 provenance). */
export function toPositionEval(
  info: UciInfo,
  provenance: PositionEval["provenance"] = "local-engine",
): PositionEval | undefined {
  if (info.mate !== undefined) {
    return { mate: info.mate, provenance, depth: info.depth };
  }
  if (info.cp !== undefined) {
    return { cp: info.cp, provenance, depth: info.depth };
  }
  return undefined;
}

// ---------------------------------------------------------------- commands

export function positionCommand(fen: string): string {
  return `position fen ${fen}`;
}

/**
 * Build the `go` command for our per-position budget (US-C1).
 *
 * Depth **and** nodes are both supplied deliberately: Stockfish stops at
 * whichever it reaches first, which is exactly the "depth ≥ 18 or ≥ 1M nodes,
 * whichever lands first" rule. Depth alone makes tactical positions explode in
 * time; nodes alone makes quiet positions stop shallow.
 */
export function goCommand(budget: { depth: number; nodes: number }): string {
  return `go depth ${budget.depth} nodes ${budget.nodes}`;
}

export function setOption(name: string, value: string | number | boolean): string {
  return `setoption name ${name} value ${String(value)}`;
}

function toInt(token: string | undefined): number | undefined {
  if (token === undefined) return undefined;
  const value = Number.parseInt(token, 10);
  return Number.isFinite(value) ? value : undefined;
}
