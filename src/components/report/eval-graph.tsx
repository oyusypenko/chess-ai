"use client";

import type { PositionEval } from "@/model/game";
import { winProbability } from "@/classifier/win-probability";
import { EVAL_GRAPH_HEIGHT, SECTION, SECTION_HEADING } from "./report-geometry";

/**
 * Evaluation over the game (US-G1).
 *
 * Plotted as **win probability**, not centipawns, for the same reason the
 * classifier uses it: a centipawn axis is unreadable at the extremes, where a
 * ±2000 spike flattens everything interesting near equality.
 *
 * Fixed height from first paint (EVAL_GRAPH_HEIGHT) with the axis drawn even
 * when empty. The line fills in per move as the engine streams (US-C1), so the
 * container must never grow — that would shift everything below it, repeatedly.
 */
export function EvalGraph({
  evals,
  totalPlies,
  activePly,
  onSelect,
}: {
  evals: ReadonlyMap<number, PositionEval>;
  totalPlies: number;
  activePly: number;
  onSelect: (ply: number) => void;
}) {
  const width = 100;
  const height = 40;

  const points: string[] = [];
  for (let ply = 0; ply <= totalPlies; ply += 1) {
    const evaluation = evals.get(ply);
    if (!evaluation) continue;
    const x = totalPlies === 0 ? 0 : (ply / totalPlies) * width;
    // Win probability 1 (White winning) at the top.
    const y = height - winProbability(evaluation) * height;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }

  const activeX = totalPlies === 0 ? 0 : (activePly / totalPlies) * width;

  return (
    <section className={SECTION} aria-labelledby="evalgraph-heading">
      <h2 id="evalgraph-heading" className={SECTION_HEADING}>
        Evaluation
      </h2>
      <div
        className={`${EVAL_GRAPH_HEIGHT} relative overflow-hidden rounded-lg border border-black/10 bg-black/[0.03] dark:border-white/15 dark:bg-white/[0.04]`}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-label={`Evaluation across ${totalPlies} moves. Higher is better for White.`}
        >
          {/* Equality line — the reference the eye needs. */}
          <line
            x1="0"
            y1={height / 2}
            x2={width}
            y2={height / 2}
            className="stroke-black/20 dark:stroke-white/25"
            strokeWidth="0.3"
            vectorEffect="non-scaling-stroke"
          />
          {points.length > 1 && (
            <polyline
              points={points.join(" ")}
              fill="none"
              className="stroke-black/70 dark:stroke-white/80"
              strokeWidth="1.2"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <line
            x1={activeX}
            y1="0"
            x2={activeX}
            y2={height}
            className="stroke-sky-600 dark:stroke-sky-400"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* Click-to-seek. Keyboard users navigate via the move list, which is
            the labelled control — this is a pointer affordance, not the only
            way in (NFR-C2). */}
        <input
          type="range"
          min={0}
          max={Math.max(totalPlies, 0)}
          value={activePly}
          onChange={(e) => onSelect(Number(e.target.value))}
          aria-label="Scrub through the game"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </section>
  );
}
