import { Chess } from "chess.js";
import type { NormalizedGame, NormalizedMove, PositionEval } from "@/model/game";

/**
 * A deterministic sample game for UI verification.
 *
 * Exists so the report can be rendered — and *measured* — without a network
 * call or an engine run. The Playwright skeleton-parity checks (D-08) drive
 * this, which is only meaningful because the data is fixed: a layout diff
 * against varying content measures the content, not the layout.
 *
 * **Deliberately representative, not clean.** An earlier version of this
 * fixture had no subject mistakes, so the key-moments section rendered its
 * empty state while the skeleton reserved three cards — a 314px mismatch that
 * looked like a skeleton bug but was a fixture bug. The evals below give White
 * three errors of different severities, which is what a 1400-rated blitz game
 * actually looks like and what the skeleton is sized for (US-D2: 3–5 moments).
 */

const SANS = [
  "e4",
  "e5",
  "Bc4",
  "Nc6",
  "Qh5",
  "Qe7",
  "Nf3",
  "Nf6",
  "Nc3",
  "d6",
  "Qxf7",
  "Qxf7",
  "Bxf7",
  "Kxf7",
  "d3",
  "Bg4",
];

/**
 * White-POV centipawns per ply; index 0 is the starting position.
 *
 * Shaped so White has exactly three reviewable moves:
 *   ply 5  (Qh5)   +35 → −90   → inaccuracy
 *   ply 9  (Nc3)   −85 → −400  → mistake
 *   ply 11 (Qxf7) −390 → −900  → inaccuracy
 *
 * The swings are placed where the position is still contested. An earlier
 * version put them after the game was already decided, where win probability
 * barely moves and only two moments qualified — the classifier behaving
 * correctly, and a reminder that severity is about the position, not the
 * centipawn delta.
 */
const CP_BY_PLY: readonly number[] = [
  20, // start
  25, // 1. e4
  15, // 1... e5
  35, // 2. Bc4
  35, // 2... Nc6
  -90, // 3. Qh5      <- inaccuracy
  -85, // 3... Qe7
  -88, // 4. Nf3
  -85, // 4... Nf6
  -400, // 5. Nc3     <- mistake
  -390, // 5... d6
  -900, // 6. Qxf7    <- inaccuracy
  -890, // 6... Qxf7
  -895, // 7. Bxf7
  -890, // 7... Kxf7
  -895, // 8. d3
  -900, // 8... Bg4
];

export function buildDemoGame(): NormalizedGame {
  const chess = new Chess();
  const moves: NormalizedMove[] = SANS.map((san, i) => {
    const fenBefore = chess.fen();
    const color = chess.turn() === "w" ? "white" : "black";
    const move = chess.move(san);
    return {
      ply: i + 1,
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      color,
      fenBefore,
      fenAfter: chess.fen(),
      // Descending clock so the time-trouble path has something to read.
      clockCentis: 30000 - i * 1600,
    };
  });

  return {
    id: "demo",
    platform: "lichess",
    url: "https://lichess.org/demo",
    playedAt: "2026-01-01T12:00:00.000Z",
    speed: "blitz",
    timeControl: { kind: "clock", initialSeconds: 300, incrementSeconds: 0 },
    rated: true,
    players: {
      white: { username: "you", rating: 1420, ratingDiff: -8, isBot: false },
      black: { username: "opponent", rating: 1395, ratingDiff: 8, isBot: false },
    },
    subject: { username: "you", color: "white", result: "loss" },
    status: "resign",
    winner: "black",
    opening: { eco: "C50", name: "Italian Game" },
    initialFen: new Chess().fen(),
    moves,
    finished: true,
  };
}

export function buildDemoEvals(): Map<number, PositionEval> {
  const evals = new Map<number, PositionEval>();
  CP_BY_PLY.forEach((cp, ply) => {
    evals.set(ply, { cp, provenance: "local-engine", depth: 18 });
  });
  return evals;
}

export function buildDemoBestLines(): Map<number, readonly string[]> {
  return new Map<number, readonly string[]>([
    [4, ["g1f3", "g8f6"]], // instead of Qh5, develop
    [10, ["e1g1"]], // instead of Qxf7
    [12, ["d2d3"]], // instead of Bxf7
  ]);
}
