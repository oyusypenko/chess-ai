"use client";

import { useEffect, useRef } from "react";
import type { ClassifiedMove } from "@/classifier/classify-game";
import { ClassificationChip } from "./classification-chip";
import { MOVE_LIST_HEIGHT, MOVE_ROW, SECTION, SECTION_HEADING } from "./report-geometry";

/**
 * Move list synced to the board (US-G1, NFR-C2).
 *
 * Keyboard navigation is a requirement, not a nicety: ← → step through the
 * game, and the active move scrolls into view. Implemented as a listbox so
 * assistive technology announces position and selection rather than reading a
 * wall of buttons.
 */
export function MoveList({
  moves,
  activePly,
  onSelect,
}: {
  moves: readonly ClassifiedMove[];
  activePly: number;
  onSelect: (ply: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activePly]);

  // Pair plies into player-facing move numbers: ply 1 and 2 are both "1.".
  const rows: Array<{ number: number; white?: ClassifiedMove; black?: ClassifiedMove }> = [];
  for (const move of moves) {
    const number = Math.ceil(move.ply / 2);
    const row = rows[number - 1] ?? { number };
    if (move.color === "white") row.white = move;
    else row.black = move;
    rows[number - 1] = row;
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onSelect(Math.min(activePly + 1, moves.length));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      onSelect(Math.max(activePly - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      onSelect(0);
    } else if (event.key === "End") {
      event.preventDefault();
      onSelect(moves.length);
    }
  }

  return (
    <section className={SECTION} aria-labelledby="movelist-heading">
      <h2 id="movelist-heading" className={SECTION_HEADING}>
        Moves
      </h2>
      <div
        ref={listRef}
        role="listbox"
        aria-label="Game moves. Use left and right arrow keys to step through."
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className={`${MOVE_LIST_HEIGHT} overflow-y-auto rounded-lg border border-black/10 p-1 focus:outline-2 focus:outline-offset-2 focus:outline-current dark:border-white/15`}
      >
        {rows.map((row) => (
          <div key={row.number} className={MOVE_ROW}>
            <span className="text-right text-xs tabular-nums text-black/40 dark:text-white/40">
              {row.number}.
            </span>
            {(["white", "black"] as const).map((color) => {
              const move = color === "white" ? row.white : row.black;
              if (!move) return <span key={color} />;
              const isActive = move.ply === activePly;
              return (
                <button
                  key={color}
                  ref={isActive ? activeRef : undefined}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => onSelect(move.ply)}
                  className={`flex items-center gap-1.5 rounded px-1 py-0.5 text-left ${
                    isActive
                      ? "bg-black/10 dark:bg-white/15"
                      : "hover:bg-black/5 dark:hover:bg-white/10"
                  }`}
                >
                  <span className="font-medium tabular-nums">{move.san}</span>
                  {move.severity > 0 || move.classification === "brilliant" ? (
                    <ClassificationChip classification={move.classification} label={move.label} />
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
