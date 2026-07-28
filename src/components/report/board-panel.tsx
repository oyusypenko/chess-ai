"use client";

import { Chessboard } from "react-chessboard";
import { BOARD_WRAPPER, SECTION } from "./report-geometry";

/**
 * Interactive board (US-G1, US-D2, NFR-L2).
 *
 * `react-chessboard` (MIT) — never `chessground`, which is GPL-3.0 and would
 * relicense our frontend (NFR-L3, D-01).
 *
 * The wrapper is `aspect-square` with no dependence on the FEN or piece set, so
 * the box is identical before and after data arrives — a board that resizes on
 * load shifts the entire page below it (D-08).
 *
 * Read-only by design: this reviews a **finished** game (NFR-L1). There is no
 * move input, and there must never be.
 */
export function BoardPanel({
  fen,
  orientation,
  arrows,
  caption,
}: {
  fen: string;
  orientation: "white" | "black";
  /** [from, to, colour] — played vs best move (US-D2). */
  arrows?: ReadonlyArray<{ startSquare: string; endSquare: string; color: string }>;
  caption?: string;
}) {
  return (
    <section className={SECTION} aria-label="Board">
      <div className={BOARD_WRAPPER}>
        <Chessboard
          options={{
            position: fen,
            boardOrientation: orientation,
            allowDragging: false,
            arrows: arrows ? [...arrows] : undefined,
            showNotation: true,
            id: "report-board",
          }}
        />
      </div>
      {caption ? (
        <p className="text-xs text-black/60 dark:text-white/60" aria-live="polite">
          {caption}
        </p>
      ) : null}
    </section>
  );
}
