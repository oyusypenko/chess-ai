import { Chess } from "chess.js";
import type {
  Color,
  NormalizedGame,
  NormalizedMove,
  Opening,
  PlayerInfo,
  PositionEval,
  Speed,
  SubjectResult,
  TimeControl,
} from "@/model/game";
import { importError } from "./errors";
import {
  isFinished,
  type LichessAnalysisEntry,
  type LichessGame,
  type LichessPlayerSide,
} from "./types";

/**
 * Lichess export JSON → `NormalizedGame` (US-B1, US-C2, NFR-L1).
 *
 * chess.js replays the SAN move list to derive FENs and UCI. We do not trust
 * the platform for legality: replaying is what catches a truncated or corrupt
 * move list, and it is the same engine the grounding validator will use later
 * (D-09), so legality can never disagree between import and validation.
 */

const SPEEDS: ReadonlySet<string> = new Set([
  "ultraBullet",
  "bullet",
  "blitz",
  "rapid",
  "classical",
  "correspondence",
]);

export function normalizeLichessGame(raw: LichessGame, subjectUsername: string): NormalizedGame {
  // NFR-L1 — the one check that must happen before anything else. The client
  // already filters, but normalization is also reachable from cached payloads
  // and (at P2) other callers, so it fails closed on its own.
  if (!isFinished(raw.status)) throw importError("no_finished_games");
  if (!raw.id) throw importError("malformed_response");

  const subjectColor = findSubjectColor(raw, subjectUsername);
  if (!subjectColor) throw importError("malformed_response");

  const initialFen = raw.initialFen ?? new Chess().fen();
  const moves = replayMoves(raw, initialFen);

  const winner = raw.winner ?? null;

  return {
    id: raw.id,
    platform: "lichess",
    url: `https://lichess.org/${raw.id}`,
    playedAt: new Date(raw.createdAt ?? raw.lastMoveAt ?? 0).toISOString(),
    speed: normalizeSpeed(raw.speed),
    timeControl: normalizeTimeControl(raw),
    rated: raw.rated ?? false,
    players: {
      white: normalizePlayer(raw.players?.white),
      black: normalizePlayer(raw.players?.black),
    },
    subject: {
      username: subjectUsername,
      color: subjectColor,
      result: subjectResult(winner, subjectColor),
    },
    status: raw.status ?? "unknownFinish",
    winner,
    opening: normalizeOpening(raw.opening),
    initialFen,
    moves,
    finished: true,
  };
}

/**
 * Case-insensitive because Lichess usernames are displayed with the user's
 * chosen casing but matched case-insensitively — "Alice" and "alice" are the
 * same account, and getting this wrong would attribute the report to the
 * opponent.
 */
function findSubjectColor(raw: LichessGame, username: string): Color | null {
  const target = username.toLowerCase();
  if (raw.players?.white?.user?.name?.toLowerCase() === target) return "white";
  if (raw.players?.black?.user?.name?.toLowerCase() === target) return "black";
  return null;
}

function subjectResult(winner: Color | null, subjectColor: Color): SubjectResult {
  if (winner === null) return "draw";
  return winner === subjectColor ? "win" : "loss";
}

/**
 * Replay the SAN move list to derive per-ply FENs and UCI.
 *
 * Index alignment is the trap here. Lichess's `clocks` and `analysis` arrays
 * are parallel to the move list, but they mean different things:
 *   - `clocks[i]`   — time remaining AFTER move i.
 *   - `analysis[i]` — evaluation of the position AFTER move i.
 * Both are 0-based over half-moves while our `ply` is 1-based, so `ply` is
 * `i + 1`. Off-by-one here silently attributes every eval to the wrong move,
 * which would invert half the classifications.
 */
function replayMoves(raw: LichessGame, initialFen: string): NormalizedMove[] {
  const sans = (raw.moves ?? "").trim();
  if (sans.length === 0) return [];

  const chess = new Chess(initialFen);
  const moves: NormalizedMove[] = [];
  const tokens = sans.split(/\s+/);

  for (let i = 0; i < tokens.length; i += 1) {
    const san = tokens[i];
    const fenBefore = chess.fen();
    // chess.js reports side-to-move for the position *before* the move, which
    // is exactly whose move this is.
    const color: Color = chess.turn() === "w" ? "white" : "black";

    let move;
    try {
      move = chess.move(san);
    } catch {
      // A move list that stops being legal means the export is corrupt. Keep
      // what replayed cleanly rather than discarding the game — a truncated
      // report beats no report — but never fabricate the rest.
      break;
    }
    if (!move) break;

    moves.push({
      ply: i + 1,
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      color,
      fenBefore,
      fenAfter: chess.fen(),
      clockCentis: raw.clocks?.[i],
      evalAfter: normalizeEval(raw.analysis?.[i]),
    });
  }

  return moves;
}

/**
 * Lichess server eval → our `PositionEval`, tagged with provenance (US-C2).
 *
 * `eval` is centipawns from White's POV; `mate` is signed mate-in-N. They are
 * mutually exclusive and must stay distinct — collapsing mate into a huge
 * centipawn number is what breaks win-probability maths at the extremes (see
 * US-C4 and the M4 plan).
 */
function normalizeEval(entry: LichessAnalysisEntry | undefined): PositionEval | undefined {
  if (!entry) return undefined;
  if (typeof entry.mate === "number") {
    return { mate: entry.mate, provenance: "lichess-server" };
  }
  if (typeof entry.eval === "number") {
    return { cp: entry.eval, provenance: "lichess-server" };
  }
  return undefined;
}

function normalizePlayer(side: LichessPlayerSide | undefined): PlayerInfo {
  return {
    username: side?.user?.name ?? null,
    rating: side?.rating ?? null,
    ratingDiff: side?.ratingDiff ?? null,
    // Lichess marks engine opponents with aiLevel rather than a user record.
    isBot: typeof side?.aiLevel === "number" || side?.user?.title === "BOT",
  };
}

function normalizeSpeed(speed: string | undefined): Speed {
  return speed && SPEEDS.has(speed) ? (speed as Speed) : "correspondence";
}

function normalizeTimeControl(raw: LichessGame): TimeControl {
  if (raw.clock && typeof raw.clock.initial === "number") {
    return {
      kind: "clock",
      initialSeconds: raw.clock.initial,
      incrementSeconds: raw.clock.increment ?? 0,
    };
  }
  if (typeof raw.daysPerTurn === "number") {
    return { kind: "correspondence", daysPerTurn: raw.daysPerTurn };
  }
  if (raw.speed === "correspondence") return { kind: "correspondence", daysPerTurn: null };
  return { kind: "unlimited" };
}

function normalizeOpening(opening: LichessGame["opening"]): Opening {
  return { eco: opening?.eco ?? null, name: opening?.name ?? null };
}
