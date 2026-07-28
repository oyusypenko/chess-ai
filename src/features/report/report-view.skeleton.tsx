import { BoardPanelSkeleton } from "@/components/report/board-panel.skeleton";
import { MoveListSkeleton } from "@/components/report/move-list.skeleton";
import { EvalGraphSkeleton } from "@/components/report/eval-graph.skeleton";
import { KeyMomentsSkeleton } from "@/components/report/key-moments.skeleton";
import { SummaryCardSkeleton } from "@/components/report/summary-card";
import { AccuracySummarySkeleton } from "@/components/report/accuracy-summary";

/**
 * Full-page skeleton (D-08).
 *
 * **The wrapper classes are duplicated from `ReportView` deliberately and must
 * stay identical** — they are the outermost geometry, so a mismatch here shifts
 * everything. (They are inline rather than in `report-geometry.ts` only because
 * they are layout scaffolding rather than component geometry; if a third
 * consumer appears, hoist them.)
 *
 * Server-safe: no `"use client"`, no hooks.
 */
export function ReportViewSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start lg:gap-8">
      <div className="flex flex-col gap-4 lg:w-[min(32rem,50%)] lg:shrink-0">
        <BoardPanelSkeleton />
        <EvalGraphSkeleton />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <SummaryCardSkeleton />
        <AccuracySummarySkeleton />
        <KeyMomentsSkeleton />
        <MoveListSkeleton />
      </div>
    </div>
  );
}
