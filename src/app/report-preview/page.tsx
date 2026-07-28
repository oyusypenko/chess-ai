"use client";

import { useState } from "react";
import { classifyGame } from "@/classifier/classify-game";
import { ReportView } from "@/features/report/report-view";
import { ReportViewSkeleton } from "@/features/report/report-view.skeleton";
import type { SummaryState } from "@/components/report/summary-card";
import { buildDemoBestLines, buildDemoEvals, buildDemoGame } from "@/features/report/demo-fixture";

/**
 * Report preview harness (D-08).
 *
 * Renders the report against fixed fixture data in each of its states so the
 * skeleton↔content geometry can be **measured**, not eyeballed. This is what
 * the Playwright parity test drives at 360 px.
 *
 * A developer surface: it displays a canned finished game and performs no
 * analysis of anything live (NFR-L1).
 */

type Mode = "loading" | "ready" | "pending";

export default function ReportPreviewPage() {
  const [mode, setMode] = useState<Mode>("loading");

  const game = buildDemoGame();
  const evals = buildDemoEvals();
  const classification = classifyGame({
    game,
    evals,
    bestLines: buildDemoBestLines(),
  });

  const summary: SummaryState =
    mode === "ready"
      ? {
          kind: "ready",
          text: "You opened with e4 and developed the bishop to a good square with Bc4.\n\nThe queen sortie Qh5 came early. It worked out here because your opponent answered Nf6, but against a defence like g6 the queen would have been chased around while you fell behind in development.\n\nNext time, try finishing development before bringing the queen out.",
        }
      : mode === "pending"
        ? { kind: "pending", onRetry: () => setMode("ready") }
        : { kind: "loading" };

  return (
    <main className="flex min-h-screen flex-col">
      <nav
        className="flex flex-wrap gap-2 border-b border-black/10 px-4 py-2 dark:border-white/15"
        aria-label="Preview state"
      >
        {(["loading", "ready", "pending"] as const).map((m) => (
          <button
            key={m}
            type="button"
            data-testid={`mode-${m}`}
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={`rounded-md border px-3 py-1 text-xs font-medium ${
              mode === m
                ? "border-black/40 bg-black/10 dark:border-white/40 dark:bg-white/15"
                : "border-black/15 dark:border-white/20"
            }`}
          >
            {m}
          </button>
        ))}
      </nav>

      <div data-testid="report-root" className="flex-1">
        {mode === "loading" ? (
          <ReportViewSkeleton />
        ) : (
          <ReportView game={game} classification={classification} evals={evals} summary={summary} />
        )}
      </div>
    </main>
  );
}
