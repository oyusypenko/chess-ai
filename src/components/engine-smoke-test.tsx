"use client";

import { useState } from "react";
import { EngineClient, recommendedThreads } from "@/engine/engine-client";
import { DEFAULT_BUDGET } from "@/engine/protocol";
import { detectEngineThreadingSupport } from "@/lib/cross-origin-isolation";

/**
 * Drives a single real engine evaluation and shows what happened (US-C1).
 *
 * The position is the Italian Game after 3...Bc5 — a quiet, well-known opening
 * where any correct engine returns a small White edge. A wildly different
 * number means the sign convention or the network load is wrong, which is
 * exactly what this page is for.
 */
const TEST_FEN = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";

type State =
  | { status: "idle" }
  | { status: "running"; depth: number; nodes: number }
  | {
      status: "done";
      ms: number;
      cp?: number;
      mate?: number;
      depth: number;
      nodes: number;
      pv: string[];
      threads: number;
    }
  | { status: "error"; message: string };

export function EngineSmokeTest() {
  const [state, setState] = useState<State>({ status: "idle" });

  async function run() {
    setState({ status: "running", depth: 0, nodes: 0 });
    const engine = new EngineClient();
    const startedAt = performance.now();
    try {
      await engine.init();
      const result = await engine.evaluate(TEST_FEN, {
        budget: DEFAULT_BUDGET,
        onProgress: ({ depth, nodes }) => setState({ status: "running", depth, nodes }),
      });
      const best = result.lines[0];
      setState({
        status: "done",
        ms: Math.round(performance.now() - startedAt),
        cp: best?.eval.cp,
        mate: best?.eval.mate,
        depth: result.depth,
        nodes: result.nodes,
        pv: [...(best?.pv ?? [])].slice(0, 6),
        threads: engine.threads,
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      engine.dispose();
    }
  }

  const support = detectEngineThreadingSupport();

  return (
    <section className="flex flex-col gap-4">
      <dl
        data-testid="engine-env"
        className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-black/70 dark:text-white/70"
      >
        <dt>crossOriginIsolated</dt>
        <dd data-testid="coi">{String(support.crossOriginIsolated)}</dd>
        <dt>SharedArrayBuffer</dt>
        <dd data-testid="sab">{String(support.sharedArrayBuffer)}</dd>
        <dt>threads</dt>
        <dd data-testid="threads">{recommendedThreads()}</dd>
      </dl>

      <button
        type="button"
        onClick={run}
        disabled={state.status === "running"}
        className="w-fit rounded-md border border-black/15 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-white/20"
      >
        {state.status === "running" ? "Analyzing…" : "Run engine check"}
      </button>

      <output data-testid="engine-result" className="block text-sm">
        {state.status === "idle" && (
          <span className="text-black/50 dark:text-white/50">Not run</span>
        )}

        {state.status === "running" && (
          <span data-testid="engine-progress">
            depth {state.depth} · {state.nodes.toLocaleString()} nodes
          </span>
        )}

        {state.status === "done" && (
          <span data-testid="engine-ok">
            OK · eval {state.mate !== undefined ? `mate ${state.mate}` : `${state.cp} cp`} · depth{" "}
            {state.depth} · {state.nodes.toLocaleString()} nodes · {state.ms} ms · {state.threads}{" "}
            thread(s) · pv {state.pv.join(" ")}
          </span>
        )}

        {state.status === "error" && (
          <span data-testid="engine-error" className="text-red-600 dark:text-red-400">
            FAILED: {state.message}
          </span>
        )}
      </output>
    </section>
  );
}
