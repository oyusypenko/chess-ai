import { gameKey, type NormalizedGame, type PositionEval } from "@/model/game";
import { EngineClient } from "@/engine/engine-client";
import { DEFAULT_BUDGET, type EngineBudget } from "@/engine/protocol";
import { planAnalysis, reuseRatio } from "./plan";
import { analysisKey, readAnalysis, writeAnalysis, type CachedAnalysis } from "./cache";

/**
 * Orchestrate a full-game analysis (US-C1, US-C2, FR-3).
 *
 * Sequence: cache → plan (reuse server evals) → engine for what remains →
 * cache the result. Progress is reported per position and the whole run is
 * cancellable, because a 40-move game takes tens of seconds and a UI that
 * cannot show progress or stop is not acceptable (US-C1).
 */

/**
 * Bump when anything that changes evaluations changes: the engine build, the
 * network, or the budget. FR-3 keys the cache on this, so a stale value would
 * serve evals from a different engine as if they were current.
 */
export const ENGINE_VERSION = "sf18-smallnet-d18n1m-v1";

export type AnalysisProgress = {
  /** Positions finished, including reused ones. */
  readonly completed: number;
  readonly total: number;
  /** Fraction in [0, 1]. */
  readonly fraction: number;
  readonly currentPly: number;
  readonly fromCache: boolean;
};

export type GameAnalysis = {
  /** Eval per ply; ply 0 is the position before White's first move. */
  readonly evals: ReadonlyMap<number, PositionEval>;
  /** Engine's best line per ply, UCI. Absent for reused positions. */
  readonly bestLines: ReadonlyMap<number, readonly string[]>;
  readonly engineVersion: string;
  /** True when the whole analysis came from cache — no engine ran. */
  readonly fromCache: boolean;
  /** Fraction of positions that skipped the engine via US-C2 reuse. */
  readonly reuseRatio: number;
};

export type AnalyzeOptions = {
  budget?: EngineBudget;
  signal?: AbortSignal;
  onProgress?: (progress: AnalysisProgress) => void;
  /** Injected in tests. */
  engine?: EngineClient;
  /** Skip cache reads/writes (tests, forced re-analysis). */
  useCache?: boolean;
};

export async function analyzeGame(
  game: NormalizedGame,
  options: AnalyzeOptions = {},
): Promise<GameAnalysis> {
  const { budget = DEFAULT_BUDGET, signal, onProgress, useCache = true } = options;

  const key = gameKey(game);
  const plan = planAnalysis(game, { minReuseDepth: budget.depth });

  // US-C1: re-opening a game never re-analyzes.
  if (useCache) {
    const cached = await readAnalysis(key, ENGINE_VERSION);
    if (cached) {
      onProgress?.({
        completed: plan.totalPositions,
        total: plan.totalPositions,
        fraction: 1,
        currentPly: 0,
        fromCache: true,
      });
      return {
        evals: new Map(Object.entries(cached.evals).map(([ply, e]) => [Number(ply), e])),
        bestLines: new Map(Object.entries(cached.bestLines).map(([ply, pv]) => [Number(ply), pv])),
        engineVersion: cached.engineVersion,
        fromCache: true,
        reuseRatio: 1,
      };
    }
  }

  const evals = new Map<number, PositionEval>(plan.reused);
  const bestLines = new Map<number, readonly string[]>();

  const engine = options.engine ?? new EngineClient();
  const ownsEngine = !options.engine;

  // Reused positions are already done — count them so the bar reflects real
  // remaining work rather than restarting at zero.
  let completed = plan.reused.size;
  const total = plan.totalPositions;

  const report = (currentPly: number) => {
    onProgress?.({
      completed,
      total,
      fraction: total === 0 ? 1 : completed / total,
      currentPly,
      fromCache: false,
    });
  };

  report(0);

  try {
    for (const target of plan.targets) {
      signal?.throwIfAborted();

      const result = await engine.evaluate(target.fen, {
        budget,
        signal,
        // Intra-position progress: without it a slow position looks frozen.
        onProgress: () => report(target.ply),
      });

      const best = result.lines[0];
      if (best) {
        evals.set(target.ply, best.eval);
        bestLines.set(target.ply, best.pv);
      } else {
        // Terminal position (mate/stalemate) — no line, but the outcome is
        // known and must still be recorded or the graph gains a hole.
        evals.set(target.ply, terminalEval(target.fen));
      }

      completed += 1;
      report(target.ply);
    }
  } finally {
    if (ownsEngine) engine.dispose();
  }

  const analysis: GameAnalysis = {
    evals,
    bestLines,
    engineVersion: ENGINE_VERSION,
    fromCache: false,
    reuseRatio: reuseRatio(plan),
  };

  if (useCache) {
    await writeAnalysis(toCacheRecord(key, analysis));
  }

  return analysis;
}

/**
 * Eval for a position with no legal moves.
 *
 * Side to move is mated or stalemated. We cannot distinguish the two from the
 * FEN alone here, so record a decisive mate-in-0 for the side to move; callers
 * that need draw-vs-mate use the game's terminal status, which is authoritative.
 */
function terminalEval(fen: string): PositionEval {
  const blackToMove = fen.split(/\s+/)[1] === "b";
  return { mate: blackToMove ? 1 : -1, provenance: "local-engine", depth: 0 };
}

function toCacheRecord(key: string, analysis: GameAnalysis): CachedAnalysis {
  return {
    key: analysisKey(key, analysis.engineVersion),
    gameKey: key,
    engineVersion: analysis.engineVersion,
    evals: Object.fromEntries(analysis.evals),
    bestLines: Object.fromEntries(analysis.bestLines),
    completedAt: new Date().toISOString(),
  };
}
