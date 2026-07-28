"use client";

import { useState } from "react";
import { Chessboard } from "react-chessboard";
import type { ClassifiedMove } from "@/classifier/classify-game";
import { ClassificationChip } from "./classification-chip";
import {
  MOMENT_CARD,
  MOMENT_TEXT_BLOCK,
  MOMENT_THUMB,
  SECTION,
  SECTION_HEADING,
} from "./report-geometry";

/**
 * Key moments (US-D2): 3–5 positions where the game turned.
 *
 * Each card carries the position, the move played versus the engine's
 * preference, and the grounded explanation. The engine line is collapsed by
 * default — US-D2 asks for it "expandable on demand", and a wall of variations
 * is exactly what makes engine output unreadable to the audience we are for.
 */
export function KeyMoments({
  moments,
  orientation,
  explanations,
  onSelect,
}: {
  moments: readonly ClassifiedMove[];
  orientation: "white" | "black";
  /** Grounded prose per ply, from the validated summary (US-D1). */
  explanations?: ReadonlyMap<number, string>;
  onSelect?: (ply: number) => void;
}) {
  if (moments.length === 0) {
    return (
      <section className={SECTION} aria-labelledby="moments-heading">
        <h2 id="moments-heading" className={SECTION_HEADING}>
          Key moments
        </h2>
        <p className="text-sm text-black/60 dark:text-white/60">
          No costly mistakes in this game — nicely done.
        </p>
      </section>
    );
  }

  return (
    <section className={SECTION} aria-labelledby="moments-heading">
      <h2 id="moments-heading" className={SECTION_HEADING}>
        Key moments
      </h2>
      <ul className="flex flex-col gap-2">
        {moments.map((moment) => (
          <li key={moment.ply}>
            <MomentCard
              moment={moment}
              orientation={orientation}
              explanation={explanations?.get(moment.ply)}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function MomentCard({
  moment,
  orientation,
  explanation,
  onSelect,
}: {
  moment: ClassifiedMove;
  orientation: "white" | "black";
  explanation?: string;
  onSelect?: (ply: number) => void;
}) {
  const [showLine, setShowLine] = useState(false);
  const moveNumber = Math.ceil(moment.ply / 2);

  return (
    <article className={MOMENT_CARD}>
      <button
        type="button"
        onClick={() => onSelect?.(moment.ply)}
        className={`${MOMENT_THUMB} focus:outline-2 focus:outline-offset-2 focus:outline-current`}
        aria-label={`Go to move ${moveNumber}, ${moment.san}`}
      >
        <Chessboard
          options={{
            position: moment.fenAfter,
            boardOrientation: orientation,
            allowDragging: false,
            showNotation: false,
            id: `moment-${moment.ply}`,
          }}
        />
      </button>

      <div className={MOMENT_TEXT_BLOCK}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium tabular-nums">
            {moveNumber}. {moment.san}
          </span>
          <ClassificationChip classification={moment.classification} label={moment.label} />
        </div>

        {/* Only grounded prose renders here. When the validator stripped it or
            the provider was down, we show the classifier's own description —
            which is a computed fact, never a generated claim (US-D1). */}
        <p className="text-xs text-black/70 dark:text-white/70">
          {explanation ?? moment.description}
        </p>

        {moment.bestMove ? (
          <div className="text-xs">
            <button
              type="button"
              onClick={() => setShowLine((v) => !v)}
              aria-expanded={showLine}
              className="underline underline-offset-2"
            >
              {showLine ? "Hide engine line" : "Show engine line"}
            </button>
            {showLine ? (
              <p className="mt-1 font-mono text-[0.6875rem] text-black/60 dark:text-white/60">
                Engine preferred: {moment.bestMove}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
