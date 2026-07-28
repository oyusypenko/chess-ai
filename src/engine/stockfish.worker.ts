/// <reference lib="webworker" />
import {
  goCommand,
  parseBestMove,
  parseInfoLine,
  positionCommand,
  setOption,
  sideToMove,
  toPositionEval,
  type UciInfo,
} from "./uci";
import type { EngineEvaluate, EngineLine, EngineRequest, EngineResponse } from "./protocol";

/**
 * The Stockfish Web Worker (US-C1, NFR-L3).
 *
 * Everything here runs off the main thread so the board stays responsive while
 * a 40-move game is analyzed. The engine itself is a **separately loaded**
 * GPLv3 WASM artifact from `/engine/` — imported at runtime, never bundled with
 * our code. That boundary is the licensing boundary; do not collapse it.
 *
 * Self-hosted rather than CDN-loaded because COEP `require-corp` (FR-7) blocks
 * cross-origin subresources — the same headers the threaded build needs.
 */

declare const self: DedicatedWorkerGlobalScope;

type StockfishWeb = {
  uci(command: string): void;
  setNnueBuffer(data: Uint8Array, index?: number): void;
  getRecommendedNnue(index?: number): string | undefined;
  listen: (data: string) => void;
  onError: (msg: string) => void;
};

let engine: StockfishWeb | null = null;
let assetPath = "/engine";

/** Lines for the position currently being searched, keyed by multipv index. */
let currentLines = new Map<number, EngineLine>();
let current: EngineEvaluate | null = null;
let lastDepth = 0;
let lastNodes = 0;
/**
 * Set while a `stop` is in flight. Stockfish still emits a `bestmove` after
 * being stopped; without this we would resolve a cancelled position as if it
 * had completed (US-C1 requires cancellation to actually cancel).
 */
let cancelled = false;

function post(message: EngineResponse) {
  self.postMessage(message);
}

self.onmessage = async (event: MessageEvent<EngineRequest>) => {
  const message = event.data;
  try {
    switch (message.type) {
      case "init":
        await init(message.assetPath, message.threads, message.hashMb);
        break;
      case "evaluate":
        evaluate(message);
        break;
      case "cancel":
        cancel();
        break;
      case "dispose":
        engine = null;
        self.close();
        break;
    }
  } catch (error) {
    post({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

async function init(path: string, threads: number, hashMb: number) {
  assetPath = path;

  // Dynamic import of the emscripten glue at RUNTIME from our own origin.
  //
  // The ignore hints are load-bearing: both bundlers would otherwise try to
  // resolve and inline this specifier, which (a) fails, since the file only
  // exists in `public/` after `npm run engine:assets`, and (b) would pull the
  // GPLv3 engine into our bundle — exactly the linkage NFR-L3 forbids. Keeping
  // it a runtime fetch is what preserves the licensing boundary *and* keeps the
  // 14 MB payload off the initial page load (NFR-P1).
  const gluePath = `${assetPath}/sf_18_smallnet.js`;
  const factory = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ gluePath))
    .default as () => Promise<StockfishWeb>;

  const sf = await factory();

  sf.listen = onEngineLine;
  sf.onError = (msg: string) => post({ type: "error", message: msg });

  // The NNUE network is a separate file the build names by content hash.
  const nnueName = sf.getRecommendedNnue(0);
  if (nnueName) {
    const response = await fetch(`${assetPath}/${nnueName}`);
    if (!response.ok) {
      throw new Error(`Could not load engine network ${nnueName} (HTTP ${response.status})`);
    }
    sf.setNnueBuffer(new Uint8Array(await response.arrayBuffer()), 0);
  }

  engine = sf;
  sf.uci("uci");
  sf.uci(setOption("Threads", Math.max(1, threads)));
  sf.uci(setOption("Hash", hashMb));
  sf.uci(setOption("MultiPV", 1));
  sf.uci("isready");

  post({ type: "ready", threads: Math.max(1, threads) });
}

function evaluate(request: EngineEvaluate) {
  if (!engine) throw new Error("Engine used before initialization");

  current = request;
  currentLines = new Map();
  lastDepth = 0;
  lastNodes = 0;
  cancelled = false;

  engine.uci(setOption("MultiPV", request.multiPv));
  engine.uci(positionCommand(request.fen));
  engine.uci(goCommand(request.budget));
}

function cancel() {
  if (!engine || !current) return;
  cancelled = true;
  engine.uci("stop");
}

function onEngineLine(line: string) {
  if (!current) return;

  const stm = sideToMove(current.fen);

  const info: UciInfo | null = parseInfoLine(line, stm);
  if (info) {
    if (info.depth !== undefined) lastDepth = info.depth;
    if (info.nodes !== undefined) lastNodes = info.nodes;

    // Only keep exact scores. A bounded score is the search saying "at least/at
    // most this" — storing it as an evaluation would feed the classifier a
    // number the engine never actually committed to.
    if (info.bound === undefined) {
      const evaluation = toPositionEval(info);
      if (evaluation && info.pv && info.pv.length > 0) {
        currentLines.set(info.multipv ?? 1, {
          multipv: info.multipv ?? 1,
          eval: evaluation,
          pv: info.pv,
        });
      }
    }

    if (info.depth !== undefined) {
      post({ type: "progress", id: current.id, depth: lastDepth, nodes: lastNodes });
    }
    return;
  }

  const best = parseBestMove(line);
  if (!best) return;

  // A cancelled search still emits bestmove; discard it rather than reporting
  // a partial result as complete.
  if (cancelled) {
    current = null;
    cancelled = false;
    return;
  }

  post({
    type: "result",
    id: current.id,
    fen: current.fen,
    lines: [...currentLines.values()].sort((a, b) => a.multipv - b.multipv),
    bestmove: best.bestmove,
    nodes: lastNodes,
    depth: lastDepth,
  });
  current = null;
}
