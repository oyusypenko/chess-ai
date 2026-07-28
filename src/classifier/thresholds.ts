/**
 * Classification categories and their thresholds (US-C4, NFR-L2).
 *
 * **Every threshold in this file is a product decision, not a magic number.**
 * US-E2 requires our methodology be explainable rather than a black box, so
 * each one carries its rationale. Changing a value here changes what users are
 * told about their chess — treat it as a decision to record (docs/decisions.md),
 * not a tuning knob, and expect fixtures to move.
 *
 * **Naming is deliberately our own** (NFR-L2). We do not use chess.com's badge
 * names or glyph designs. The vocabulary below is chosen to be plain and
 * non-judgemental — a beginner reading "Blunder" five times learns less than
 * one reading "Costly", so the labels describe *impact*, not the player.
 *
 * Clean-room (NFR-L3, D-03): thresholds are ours, expressed against the
 * documented win-probability scale in `win-probability.ts`.
 */

export const CLASSIFICATIONS = [
  "best",
  "excellent",
  "good",
  "book",
  "inaccuracy",
  "mistake",
  "costly",
  "missedWin",
  "brilliant",
] as const;

export type Classification = (typeof CLASSIFICATIONS)[number];

/**
 * The loss ladder, as explicit ordered bands.
 *
 * Each entry is the **inclusive lower bound** of its category, ascending; a
 * move belongs to the last band whose `min` it reaches. Expressed this way
 * rather than as a set of named cut-offs because "is 0.07 a good move or an
 * inaccuracy?" must have exactly one answer that is readable straight off the
 * table — US-C4 requires a deterministic classifier and US-E2 requires the
 * methodology be explainable.
 *
 * Values are absolute win probability in [0, 1]: 0.10 means "this move cost you
 * ten percentage points of expected result".
 */
export const LOSS_BANDS = [
  {
    min: 0,
    classification: "excellent",
    why: "Indistinguishable from the engine's choice in practical terms.",
  },
  {
    min: 0.02,
    classification: "good",
    why: "Slightly imprecise; the character of the position is unchanged.",
  },
  {
    min: 0.1,
    classification: "inaccuracy",
    why: "Gave up real equity — the kind of move worth reviewing.",
  },
  {
    min: 0.2,
    classification: "mistake",
    why: "Changed the assessment of the position.",
  },
  {
    min: 0.3,
    classification: "costly",
    why: "Decisive: typically turns a playable game into a lost one.",
  },
] as const satisfies ReadonlyArray<{ min: number; classification: string; why: string }>;

/** Convenience lookup for the individual boundaries. */
export const LOSS_THRESHOLDS = {
  good: 0.02,
  inaccuracy: 0.1,
  mistake: 0.2,
  costly: 0.3,
} as const;

/**
 * User-facing labels and their meaning.
 *
 * `description` is what we show; it is also what the LLM is allowed to restate
 * (US-D1) — the model narrates these facts, it does not invent its own
 * vocabulary for them.
 */
export const CLASSIFICATION_META: Record<
  Classification,
  { label: string; description: string; severity: 0 | 1 | 2 | 3 }
> = {
  best: {
    label: "Best",
    description: "The strongest move available.",
    severity: 0,
  },
  excellent: {
    label: "Excellent",
    description: "As good as the best move in practical terms.",
    severity: 0,
  },
  good: {
    label: "Good",
    description: "A sound move that keeps your position.",
    severity: 0,
  },
  book: {
    label: "Book",
    description: "A known opening move.",
    severity: 0,
  },
  inaccuracy: {
    label: "Inaccuracy",
    description: "Gave up some of your advantage.",
    severity: 1,
  },
  mistake: {
    label: "Mistake",
    description: "Changed the assessment of the position.",
    severity: 2,
  },
  costly: {
    label: "Costly",
    description: "Turned the game around.",
    severity: 3,
  },
  missedWin: {
    label: "Missed win",
    description: "A winning line was available and this move let it slip.",
    severity: 2,
  },
  brilliant: {
    label: "Brilliant",
    description: "A strong move that gives up material for a bigger gain.",
    severity: 0,
  },
};

/**
 * Extra conditions for the two special categories.
 *
 * These are intentionally conservative. A label that fires too easily is worse
 * than one that never fires: "Brilliant" on a routine recapture teaches the
 * player nothing and makes every other badge less believable.
 */
export const SPECIAL = {
  /** A win is "missed" only if the position was genuinely winning before… */
  missedWinBefore: 0.85,
  /** …and is no longer winning after. */
  missedWinAfter: 0.65,
  /** Brilliant requires a real sacrifice, in centipawns of material. */
  brilliantMinSacrificeCp: 150,
  /** …and the move must still be near-best despite the material cost. */
  brilliantMaxLoss: 0.02,
  /** …and the position must not already be completely winning. */
  brilliantMaxWinProbBefore: 0.9,
} as const;

/** Material values in centipawns, used for sacrifice detection. */
export const PIECE_VALUES: Record<string, number> = {
  p: 100,
  n: 300,
  b: 320,
  r: 500,
  q: 900,
  k: 0,
};
