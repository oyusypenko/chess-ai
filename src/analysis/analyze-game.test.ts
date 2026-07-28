import { describe, it, expect, vi } from "vitest";
import { analyzeGame, ENGINE_VERSION } from "./analyze-game";
import type { NormalizedGame, NormalizedMove, PositionEval } from "@/model/game";
import type { EngineClient } from "@/engine/engine-client";
import type { EngineResult } from "@/engine/protocol";

function move(ply: number, evalAfter?: PositionEval): NormalizedMove {
  return {
    ply,
    san: "e4",
    uci: "e2e4",
    color: ply % 2 === 1 ? "white" : "black",
    fenBefore: `before-${ply}`,
    fenAfter: `after-${ply} w - - 0 1`,
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
    initialFen: "start w - - 0 1",
    moves,
    finished: true,
  };
}

/** Engine stub that returns a fixed cp for every position. */
function stubEngine(overrides: Partial<EngineResult> = {}) {
  const evaluate = vi.fn(async (fen: string, opts?: { onProgress?: (p: unknown) => void }) => {
    opts?.onProgress?.({ depth: 18, nodes: 1000 });
    return {
      type: "result",
      id: 1,
      fen,
      lines: [
        {
          multipv: 1,
          eval: { cp: 30, provenance: "local-engine", depth: 18 } as PositionEval,
          pv: ["e2e4", "e7e5"],
        },
      ],
      bestmove: "e2e4",
      nodes: 1000,
      depth: 18,
      ...overrides,
    } as EngineResult;
  });
  const dispose = vi.fn();
  return { evaluate, dispose } as unknown as EngineClient & {
    evaluate: typeof evaluate;
    dispose: typeof dispose;
  };
}

describe("analyzeGame — engine work", () => {
  it("evaluates the start position plus every unevaluated ply", async () => {
    const engine = stubEngine();
    const result = await analyzeGame(game([move(1), move(2)]), { engine, useCache: false });

    // ply 0 (start) + ply 1 + ply 2
    expect(engine.evaluate).toHaveBeenCalledTimes(3);
    expect(result.evals.size).toBe(3);
    expect(result.evals.get(0)).toMatchObject({ cp: 30 });
  });

  it("skips positions with reusable server evals (US-C2)", async () => {
    const engine = stubEngine();
    const result = await analyzeGame(
      game([
        move(1, { cp: 12, provenance: "lichess-server" }),
        move(2, { cp: -5, provenance: "lichess-server" }),
      ]),
      { engine, useCache: false },
    );

    // Only the start position needed the engine.
    expect(engine.evaluate).toHaveBeenCalledTimes(1);
    expect(result.evals.get(1)).toEqual({ cp: 12, provenance: "lichess-server" });
    expect(result.reuseRatio).toBeCloseTo(2 / 3);
  });

  it("records the best line per analyzed ply for key moments (US-D2)", async () => {
    const engine = stubEngine();
    const result = await analyzeGame(game([move(1)]), { engine, useCache: false });
    expect(result.bestLines.get(1)).toEqual(["e2e4", "e7e5"]);
  });

  it("records an eval for terminal positions so the graph has no hole", async () => {
    const engine = stubEngine({ lines: [], bestmove: null });
    const result = await analyzeGame(game([move(1)]), { engine, useCache: false });
    expect(result.evals.get(1)?.mate).toBeDefined();
  });

  it("disposes an engine it created, but not one that was injected", async () => {
    const engine = stubEngine();
    await analyzeGame(game([move(1)]), { engine, useCache: false });
    // Injected engines are the caller's to manage — disposing would break reuse
    // across games.
    expect(engine.dispose).not.toHaveBeenCalled();
  });
});

describe("analyzeGame — progress (US-C1)", () => {
  it("reports monotonic progress ending at 1", async () => {
    const engine = stubEngine();
    const seen: number[] = [];
    const result = await analyzeGame(game([move(1), move(2)]), {
      engine,
      useCache: false,
      onProgress: (p) => seen.push(p.fraction),
    });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toBe(1);
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    }
    expect(result.evals.size).toBe(3);
  });

  it("counts reused positions as already done rather than restarting at zero", async () => {
    const engine = stubEngine();
    const first: number[] = [];
    await analyzeGame(game([move(1, { cp: 1, provenance: "lichess-server" }), move(2)]), {
      engine,
      useCache: false,
      onProgress: (p) => first.push(p.completed),
    });
    // Starts at 1 (the reused ply), not 0.
    expect(first[0]).toBe(1);
  });
});

describe("analyzeGame — cancellation (US-C1)", () => {
  it("stops evaluating when the signal aborts", async () => {
    const controller = new AbortController();
    let calls = 0;
    const engine = {
      evaluate: vi.fn(async (fen: string) => {
        calls += 1;
        if (calls === 2) controller.abort();
        return {
          type: "result",
          id: calls,
          fen,
          lines: [
            {
              multipv: 1,
              eval: { cp: 0, provenance: "local-engine", depth: 18 },
              pv: ["e2e4"],
            },
          ],
          bestmove: "e2e4",
          nodes: 10,
          depth: 18,
        } as EngineResult;
      }),
      dispose: vi.fn(),
    } as unknown as EngineClient;

    const moves = [move(1), move(2), move(3), move(4)];
    await expect(
      analyzeGame(game(moves), { engine, useCache: false, signal: controller.signal }),
    ).rejects.toThrow();

    // Must not have ploughed through all 5 positions after the abort.
    expect((engine.evaluate as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThan(5);
  });
});

describe("analyzeGame — engine version (FR-3)", () => {
  it("stamps the analysis with the engine version", async () => {
    const engine = stubEngine();
    const result = await analyzeGame(game([move(1)]), { engine, useCache: false });
    expect(result.engineVersion).toBe(ENGINE_VERSION);
  });

  it("version string encodes build and budget so a change invalidates the cache", () => {
    // If the budget or build changes without bumping this, stale evals from a
    // different engine would be served as current.
    expect(ENGINE_VERSION).toMatch(/sf18/);
    expect(ENGINE_VERSION).toMatch(/d18/);
  });
});
