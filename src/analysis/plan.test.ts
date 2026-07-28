import { describe, it, expect } from "vitest";
import { planAnalysis, isReusable, reuseRatio } from "./plan";
import type { NormalizedGame, NormalizedMove, PositionEval } from "@/model/game";

function move(ply: number, evalAfter?: PositionEval): NormalizedMove {
  return {
    ply,
    san: "e4",
    uci: "e2e4",
    color: ply % 2 === 1 ? "white" : "black",
    fenBefore: `fen-before-${ply}`,
    fenAfter: `fen-after-${ply}`,
    evalAfter,
  };
}

function game(moves: NormalizedMove[]): NormalizedGame {
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
    subject: { username: "a", color: "white", result: "win" },
    status: "mate",
    winner: "white",
    opening: { eco: null, name: null },
    initialFen: "start-fen",
    moves,
    finished: true,
  };
}

describe("isReusable — US-C2 trust rules", () => {
  it("trusts a Lichess server eval regardless of stated depth", () => {
    expect(isReusable({ cp: 20, provenance: "lichess-server" }, 18)).toBe(true);
  });

  it("trusts a local eval only at or above the reuse depth", () => {
    expect(isReusable({ cp: 20, provenance: "local-engine", depth: 18 }, 18)).toBe(true);
    expect(isReusable({ cp: 20, provenance: "local-engine", depth: 20 }, 18)).toBe(true);
  });

  it("REJECTS a shallow local eval — a wrong label is worse than a slow report", () => {
    expect(isReusable({ cp: 20, provenance: "local-engine", depth: 4 }, 18)).toBe(false);
  });

  it("rejects a local eval with no recorded depth", () => {
    expect(isReusable({ cp: 20, provenance: "local-engine" }, 18)).toBe(false);
  });

  it("rejects a missing eval", () => {
    expect(isReusable(undefined, 18)).toBe(false);
  });
});

describe("planAnalysis", () => {
  it("always evaluates the starting position", () => {
    // Classifying move 1 needs the position before it, which no move produced.
    const plan = planAnalysis(game([]));
    expect(plan.targets).toEqual([{ ply: 0, fen: "start-fen" }]);
    expect(plan.totalPositions).toBe(1);
  });

  it("queues every position when the game has no server evals", () => {
    const plan = planAnalysis(game([move(1), move(2), move(3)]));
    expect(plan.targets.map((t) => t.ply)).toEqual([0, 1, 2, 3]);
    expect(plan.reused.size).toBe(0);
  });

  it("skips positions that already have a trustworthy eval (US-C2)", () => {
    const plan = planAnalysis(
      game([
        move(1, { cp: 20, provenance: "lichess-server" }),
        move(2, { cp: -15, provenance: "lichess-server" }),
        move(3),
      ]),
    );
    // Only the start position and the un-evaluated ply 3 need the engine.
    expect(plan.targets.map((t) => t.ply)).toEqual([0, 3]);
    expect(plan.reused.get(1)).toEqual({ cp: 20, provenance: "lichess-server" });
    expect(plan.reused.get(2)).toEqual({ cp: -15, provenance: "lichess-server" });
  });

  it("targets fenAfter, since that is the position being evaluated", () => {
    const plan = planAnalysis(game([move(1)]));
    expect(plan.targets.find((t) => t.ply === 1)?.fen).toBe("fen-after-1");
  });

  it("re-queues shallow local evals rather than trusting them", () => {
    const plan = planAnalysis(game([move(1, { cp: 20, provenance: "local-engine", depth: 3 })]));
    expect(plan.targets.map((t) => t.ply)).toEqual([0, 1]);
    expect(plan.reused.size).toBe(0);
  });

  it("honours a custom reuse depth", () => {
    const moves = [move(1, { cp: 20, provenance: "local-engine", depth: 12 })];
    expect(planAnalysis(game(moves), { minReuseDepth: 10 }).reused.size).toBe(1);
    expect(planAnalysis(game(moves), { minReuseDepth: 18 }).reused.size).toBe(0);
  });
});

describe("reuseRatio", () => {
  it("reports the fraction of positions that skipped the engine", () => {
    const fullyAnalyzed = game([
      move(1, { cp: 1, provenance: "lichess-server" }),
      move(2, { cp: 2, provenance: "lichess-server" }),
      move(3, { cp: 3, provenance: "lichess-server" }),
    ]);
    // 3 of 4 positions reused; the start position always needs work.
    expect(reuseRatio(planAnalysis(fullyAnalyzed))).toBeCloseTo(0.75);
    expect(reuseRatio(planAnalysis(game([move(1), move(2)])))).toBe(0);
  });
});
