import type { PositionEval } from "@/model/game";

/**
 * Typed messages across the Worker boundary (US-C1).
 *
 * The boundary is also the GPLv3 boundary (NFR-L3): everything on the worker
 * side talks UCI to a separately-loaded WASM artifact, and nothing but these
 * plain messages crosses back. Keeping the contract explicit is what makes that
 * separation reviewable rather than incidental.
 */

export type EngineBudget = {
  /** Stop at this depth… */
  readonly depth: number;
  /** …or this many nodes, whichever lands first (US-C1). */
  readonly nodes: number;
};

/** US-C1: depth ≥ 18 or ≥ 1M nodes. */
export const DEFAULT_BUDGET: EngineBudget = { depth: 18, nodes: 1_000_000 };

export type EngineInit = {
  readonly type: "init";
  /** Base path for the self-hosted artifacts (FR-7 requires same-origin). */
  readonly assetPath: string;
  /** 1 forces the single-threaded path (NFR-C1 fallback). */
  readonly threads: number;
  readonly hashMb: number;
};

export type EngineEvaluate = {
  readonly type: "evaluate";
  /** Correlates the reply; positions are analyzed one at a time per worker. */
  readonly id: number;
  readonly fen: string;
  readonly budget: EngineBudget;
  /** How many lines to request; >1 gives alternatives for key moments (US-D2). */
  readonly multiPv: number;
};

export type EngineCancel = { readonly type: "cancel" };
export type EngineDispose = { readonly type: "dispose" };

export type EngineRequest = EngineInit | EngineEvaluate | EngineCancel | EngineDispose;

export type EngineReady = { readonly type: "ready"; readonly threads: number };

export type EngineLine = {
  /** 1 is the principal variation. */
  readonly multipv: number;
  readonly eval: PositionEval;
  /** UCI long algebraic. */
  readonly pv: readonly string[];
};

export type EngineProgress = {
  readonly type: "progress";
  readonly id: number;
  readonly depth: number;
  readonly nodes: number;
};

export type EngineResult = {
  readonly type: "result";
  readonly id: number;
  readonly fen: string;
  /** Best first. Empty in terminal positions (mate/stalemate). */
  readonly lines: readonly EngineLine[];
  readonly bestmove: string | null;
  readonly nodes: number;
  readonly depth: number;
};

export type EngineFailure = {
  readonly type: "error";
  readonly id?: number;
  readonly message: string;
};

export type EngineResponse = EngineReady | EngineProgress | EngineResult | EngineFailure;
