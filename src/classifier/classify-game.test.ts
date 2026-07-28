import { describe, it, expect } from "vitest";
import { classifyGame, selectKeyMoments } from "./classify-game";
import type { NormalizedGame, NormalizedMove, PositionEval } from "@/model/game";

const cp = (n: number): PositionEval => ({ cp: n, provenance: "local-engine", depth: 18 });

function move(ply: number, san = "e4"): NormalizedMove {
  return {
    ply,
    san,
    uci: "e2e4",
    color: ply % 2 === 1 ? "white" : "black",
    fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    fenAfter: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  };
}

function game(moves: NormalizedMove[], subjectColor: "white" | "black" = "white"): NormalizedGame {
  return {
    id: "g1",
    platform: "lichess",
    url: "https://lichess.org/g1",
    playedAt: "2026-01-01T00:00:00.000Z",
    speed: "blitz",
    timeControl: { kind: "clock", initialSeconds: 300, incrementSeconds: 0 },
    rated: true,
    players: {
      white: { username: "a", rating: 1500, ratingDiff: null, isBot: false },
      black: { username: "b", rating: 1500, ratingDiff: null, isBot: false },
    },
    subject: { username: subjectColor === "white" ? "a" : "b", color: subjectColor, result: "win" },
    status: "mate",
    winner: "white",
    opening: { eco: null, name: null },
    initialFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    moves,
    finished: true,
  };
}

describe("classifyGame — eval alignment", () => {
  it("uses ply-1 as the 'before' eval, so ply 1 reads the starting position", () => {
    // Off-by-one here would classify every move against the wrong baseline.
    const evals = new Map([
      [0, cp(0)],
      [1, cp(-300)], // White's move 1 was terrible
      [2, cp(-290)],
    ]);
    const result = classifyGame({ game: game([move(1), move(2)]), evals });

    expect(result.moves[0].ply).toBe(1);
    expect(result.moves[0].loss).toBeGreaterThan(0.2);
    // Black's reply barely changed anything.
    expect(result.moves[1].loss).toBeLessThan(0.05);
  });

  it("charges the right player when Black blunders", () => {
    const evals = new Map([
      [0, cp(0)],
      [1, cp(10)],
      [2, cp(400)], // Black's move made White much better
    ]);
    const result = classifyGame({ game: game([move(1), move(2)]), evals });
    expect(result.moves[1].color).toBe("black");
    expect(result.moves[1].loss).toBeGreaterThan(0.2);
    expect(result.moves[0].loss).toBeLessThan(0.05);
  });

  it("handles missing evals without inventing judgements", () => {
    const result = classifyGame({ game: game([move(1), move(2)]), evals: new Map() });
    expect(result.moves).toHaveLength(2);
    expect(result.moves.every((m) => m.loss === 0)).toBe(true);
  });
});

describe("classifyGame — aggregates", () => {
  it("counts categories for the subject only", () => {
    const evals = new Map([
      [0, cp(0)],
      [1, cp(-400)], // White blunder
      [2, cp(-390)],
      [3, cp(-380)],
    ]);
    const result = classifyGame({ game: game([move(1), move(2), move(3)], "white"), evals });
    const total = Object.values(result.subjectCounts).reduce((a, b) => a + b, 0);
    // Two White moves out of three plies.
    expect(total).toBe(2);
  });

  it("computes accuracy per side", () => {
    const evals = new Map([
      [0, cp(0)],
      [1, cp(0)],
      [2, cp(0)],
    ]);
    const result = classifyGame({ game: game([move(1), move(2)]), evals });
    expect(result.accuracy.white).toBe(100);
    expect(result.accuracy.black).toBe(100);
  });

  it("returns 100 accuracy for a side with no moves rather than NaN", () => {
    const result = classifyGame({ game: game([]), evals: new Map() });
    expect(result.accuracy.white).toBe(100);
    expect(result.accuracy.black).toBe(100);
  });
});

describe("selectKeyMoments (US-D2)", () => {
  const evals = new Map([
    [0, cp(0)],
    [1, cp(-500)], // White: huge loss
    [2, cp(-490)],
    [3, cp(-560)], // White: moderate loss
    [4, cp(-550)],
    [5, cp(-600)], // White: small loss
  ]);

  it("returns only the subject's moves", () => {
    const result = classifyGame({
      game: game([move(1), move(2), move(3), move(4), move(5)], "white"),
      evals,
    });
    const moments = selectKeyMoments(result, "white");
    expect(moments.every((m) => m.color === "white")).toBe(true);
  });

  it("orders by cost, worst first", () => {
    const result = classifyGame({
      game: game([move(1), move(2), move(3), move(4), move(5)], "white"),
      evals,
    });
    const moments = selectKeyMoments(result, "white");
    for (let i = 1; i < moments.length; i += 1) {
      expect(moments[i - 1].loss).toBeGreaterThanOrEqual(moments[i].loss);
    }
  });

  it("caps at the requested limit (US-D2 wants 3–5)", () => {
    const result = classifyGame({
      game: game([move(1), move(2), move(3), move(4), move(5)], "white"),
      evals,
    });
    expect(selectKeyMoments(result, "white", 3).length).toBeLessThanOrEqual(3);
  });

  it("is deterministic when losses tie", () => {
    const tied = new Map([
      [0, cp(0)],
      [1, cp(-200)],
      [2, cp(-200)],
      [3, cp(-400)],
    ]);
    const result = classifyGame({ game: game([move(1), move(2), move(3)], "white"), evals: tied });
    const a = selectKeyMoments(result, "white").map((m) => m.ply);
    const b = selectKeyMoments(result, "white").map((m) => m.ply);
    expect(a).toEqual(b);
  });

  it("returns nothing when the player made no mistakes", () => {
    const clean = new Map([
      [0, cp(0)],
      [1, cp(0)],
      [2, cp(0)],
    ]);
    const result = classifyGame({ game: game([move(1), move(2)], "white"), evals: clean });
    expect(selectKeyMoments(result, "white")).toHaveLength(0);
  });
});
