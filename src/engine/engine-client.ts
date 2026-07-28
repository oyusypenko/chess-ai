import { detectEngineThreadingSupport } from "@/lib/cross-origin-isolation";
import {
  DEFAULT_BUDGET,
  type EngineBudget,
  type EngineRequest,
  type EngineResponse,
  type EngineResult,
} from "./protocol";

/**
 * Main-thread handle for the Stockfish worker (US-C1, NFR-C1).
 *
 * Owns worker lifecycle, request correlation, and cancellation. One position at
 * a time per worker: Stockfish is a single search engine, and queueing here
 * keeps the protocol trivially correct rather than interleaving searches.
 */

export type EngineClientOptions = {
  assetPath?: string;
  /** Override thread count; otherwise derived from the device (NFR-C1). */
  threads?: number;
  hashMb?: number;
  /** Injected in tests so no real Worker or WASM is required. */
  createWorker?: () => Worker;
};

export type EvaluateOptions = {
  budget?: EngineBudget;
  multiPv?: number;
  signal?: AbortSignal;
  onProgress?: (progress: { depth: number; nodes: number }) => void;
};

/**
 * Thread count for the engine.
 *
 * Capped at 4 and always leaves a core free: the UI must stay responsive while
 * analyzing (US-C1 requires per-move progress and a working cancel button), and
 * saturating every core makes the page feel broken even though it is working.
 * Returns 1 when the document is not cross-origin isolated — the single-
 * threaded build is a supported path, not a failure (NFR-C1, FR-7).
 */
export function recommendedThreads(): number {
  const support = detectEngineThreadingSupport();
  if (!support.threaded) return 1;
  const cores = globalThis.navigator?.hardwareConcurrency ?? 2;
  return Math.max(1, Math.min(4, cores - 1));
}

export class EngineClient {
  #worker: Worker | null = null;
  #ready: Promise<void> | null = null;
  #nextId = 1;
  #pending = new Map<
    number,
    {
      resolve: (result: EngineResult) => void;
      reject: (error: Error) => void;
      onProgress?: (p: { depth: number; nodes: number }) => void;
    }
  >();
  #threads = 1;
  readonly #options: EngineClientOptions;

  constructor(options: EngineClientOptions = {}) {
    this.#options = options;
  }

  /** Threads actually in use — 1 means the single-threaded fallback (NFR-C1). */
  get threads(): number {
    return this.#threads;
  }

  async init(): Promise<void> {
    this.#ready ??= this.#doInit();
    return this.#ready;
  }

  async #doInit(): Promise<void> {
    const worker =
      this.#options.createWorker?.() ??
      new Worker(new URL("./stockfish.worker.ts", import.meta.url), { type: "module" });

    this.#worker = worker;
    this.#threads = this.#options.threads ?? recommendedThreads();

    const ready = new Promise<void>((resolve, reject) => {
      const onMessage = (event: MessageEvent<EngineResponse>) => {
        if (event.data.type === "ready") {
          worker.removeEventListener("message", onMessage);
          resolve();
        } else if (event.data.type === "error") {
          worker.removeEventListener("message", onMessage);
          reject(new Error(event.data.message));
        }
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", (e) => reject(new Error(e.message)));
    });

    worker.addEventListener("message", this.#onMessage);

    this.#send({
      type: "init",
      assetPath: this.#options.assetPath ?? "/engine",
      threads: this.#threads,
      hashMb: this.#options.hashMb ?? 64,
    });

    await ready;
  }

  #onMessage = (event: MessageEvent<EngineResponse>) => {
    const message = event.data;
    switch (message.type) {
      case "progress": {
        this.#pending.get(message.id)?.onProgress?.({
          depth: message.depth,
          nodes: message.nodes,
        });
        break;
      }
      case "result": {
        const entry = this.#pending.get(message.id);
        if (entry) {
          this.#pending.delete(message.id);
          entry.resolve(message);
        }
        break;
      }
      case "error": {
        const error = new Error(message.message);
        if (message.id !== undefined) {
          const entry = this.#pending.get(message.id);
          this.#pending.delete(message.id);
          entry?.reject(error);
        } else {
          // Fatal: fail everything in flight rather than hanging forever.
          for (const [, entry] of this.#pending) entry.reject(error);
          this.#pending.clear();
        }
        break;
      }
      default:
        break;
    }
  };

  async evaluate(fen: string, options: EvaluateOptions = {}): Promise<EngineResult> {
    await this.init();
    const id = this.#nextId++;

    return new Promise<EngineResult>((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(abortError());
        return;
      }

      this.#pending.set(id, { resolve, reject, onProgress: options.onProgress });

      options.signal?.addEventListener(
        "abort",
        () => {
          // Tell the engine to stop, then reject. Without the `stop`, an
          // abandoned search keeps burning CPU and the next position blows its
          // budget (US-C1).
          if (this.#pending.delete(id)) {
            this.#send({ type: "cancel" });
            reject(abortError());
          }
        },
        { once: true },
      );

      this.#send({
        type: "evaluate",
        id,
        fen,
        budget: options.budget ?? DEFAULT_BUDGET,
        multiPv: options.multiPv ?? 1,
      });
    });
  }

  dispose(): void {
    if (!this.#worker) return;
    this.#send({ type: "dispose" });
    this.#worker.removeEventListener("message", this.#onMessage);
    this.#worker.terminate();
    this.#worker = null;
    this.#ready = null;
    for (const [, entry] of this.#pending) entry.reject(new Error("Engine disposed"));
    this.#pending.clear();
  }

  #send(message: EngineRequest) {
    this.#worker?.postMessage(message);
  }
}

function abortError(): Error {
  return Object.assign(new Error("Analysis cancelled"), { name: "AbortError" });
}
