"use client";

import { useMemo, useState } from "react";
import type { NormalizedGame, PositionEval } from "@/model/game";
import type { GameClassification } from "@/classifier/classify-game";
import { selectKeyMoments } from "@/classifier/classify-game";
import { BoardPanel } from "@/components/report/board-panel";
import { MoveList } from "@/components/report/move-list";
import { EvalGraph } from "@/components/report/eval-graph";
import { KeyMoments } from "@/components/report/key-moments";
import { SummaryCard, type SummaryState } from "@/components/report/summary-card";
import { AccuracySummary } from "@/components/report/accuracy-summary";

/**
 * The report screen (US-G1, US-D2).
 *
 * **Mobile-first**: a single column at 360 px, widening to two at `lg:`. The
 * board leads because it is the anchor; the summary sits directly under it
 * because that is what the user came for.
 *
 * Navigation state lives here so board, move list, and eval graph stay in sync
 * — three components with their own idea of "current move" is how a report
 * starts lying to people.
 */
export function ReportView({
  game,
  classification,
  evals,
  summary,
}: {
  game: NormalizedGame;
  classification: GameClassification;
  evals: ReadonlyMap<number, PositionEval>;
  summary: SummaryState;
}) {
  const [activePly, setActivePly] = useState(game.moves.length);

  const fen = useMemo(() => {
    if (activePly <= 0) return game.initialFen;
    return game.moves.find((m) => m.ply === activePly)?.fenAfter ?? game.initialFen;
  }, [activePly, game]);

  const moments = useMemo(
    () => selectKeyMoments(classification, game.subject.color, 5),
    [classification, game.subject.color],
  );

  const active = classification.moves.find((m) => m.ply === activePly);
  const caption = active
    ? `Move ${Math.ceil(active.ply / 2)}: ${active.san} — ${active.label}`
    : "Starting position";

  // Played-vs-best arrows on the current move (US-D2).
  const arrows = useMemo(() => {
    if (!active) return undefined;
    const played = game.moves.find((m) => m.ply === active.ply);
    const list: Array<{ startSquare: string; endSquare: string; color: string }> = [];
    if (played) {
      list.push({
        startSquare: played.uci.slice(0, 2),
        endSquare: played.uci.slice(2, 4),
        color: "rgba(30,64,175,0.75)",
      });
    }
    if (active.bestMove && active.bestMove !== played?.uci) {
      list.push({
        startSquare: active.bestMove.slice(0, 2),
        endSquare: active.bestMove.slice(2, 4),
        color: "rgba(5,150,105,0.75)",
      });
    }
    return list;
  }, [active, game.moves]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start lg:gap-8">
      <div className="flex flex-col gap-4 lg:w-[min(32rem,50%)] lg:shrink-0">
        <BoardPanel fen={fen} orientation={game.subject.color} arrows={arrows} caption={caption} />
        <EvalGraph
          evals={evals}
          totalPlies={game.moves.length}
          activePly={activePly}
          onSelect={setActivePly}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <SummaryCard state={summary} />
        <AccuracySummary classification={classification} subjectColor={game.subject.color} />
        <KeyMoments moments={moments} orientation={game.subject.color} onSelect={setActivePly} />
        <MoveList moves={classification.moves} activePly={activePly} onSelect={setActivePly} />
      </div>
    </div>
  );
}
