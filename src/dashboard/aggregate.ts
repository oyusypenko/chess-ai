import type { Classification } from "@/classifier/thresholds";

/**
 * Cross-game aggregates (US-E1, US-E2).
 *
 * Pure functions over already-computed reports — no engine, no network, no
 * database. That keeps the statistics unit-testable, which matters more here
 * than anywhere else in the product: a dashboard that quietly computes a wrong
 * number is worse than one that fails, because nobody notices.
 */

/** US-E1: any statistic with n < 10 is reported as insufficient, never as a number. */
export const MIN_SAMPLE = 10;

export type ReportSummary = {
  readonly gameId: string;
  readonly playedAt: string;
  readonly speed: string;
  readonly color: "white" | "black";
  readonly result: "win" | "loss" | "draw";
  readonly eco: string | null;
  readonly openingName: string | null;
  readonly accuracy: number | null;
  /** Counts of the subject's own moves, by category. */
  readonly counts: Partial<Record<Classification, number>>;
  /** Per-mistake context, used for phase and time-trouble breakdowns. */
  readonly mistakes: readonly {
    readonly ply: number;
    readonly classification: Classification;
    readonly phase: "opening" | "middlegame" | "endgame";
    readonly lowClock: boolean;
  }[];
};

/**
 * A statistic that knows whether it is trustworthy.
 *
 * Modelled as a union rather than `value: number | null` so a caller cannot
 * render `0` for "not enough data" by forgetting a check — the type makes the
 * insufficient case impossible to ignore (US-E1).
 */
export type Stat =
  | { readonly kind: "value"; readonly value: number; readonly sample: number }
  | { readonly kind: "insufficient"; readonly sample: number; readonly needed: number };

export function stat(value: number, sample: number, needed = MIN_SAMPLE): Stat {
  if (sample < needed) return { kind: "insufficient", sample, needed };
  return { kind: "value", value, sample };
}

export type PhaseBreakdown = Record<"opening" | "middlegame" | "endgame", Stat>;

export type SplitRow = {
  readonly key: string;
  readonly label: string;
  readonly games: number;
  readonly winRate: Stat;
  readonly accuracy: Stat;
};

export type DashboardAggregate = {
  readonly window: number;
  readonly gamesAnalyzed: number;
  readonly accuracy: Stat;
  /** Mistakes (severity ≥ 1) per game, by phase. */
  readonly blunderRateByPhase: PhaseBreakdown;
  readonly byOpening: readonly SplitRow[];
  readonly byColor: readonly SplitRow[];
  readonly byTimeControl: readonly SplitRow[];
  /** Share of mistakes made on a low clock (US-E1 time-trouble indicator). */
  readonly timeTrouble: Stat;
  readonly accuracyTrend: readonly { readonly playedAt: string; readonly accuracy: number }[];
};

const MISTAKE_KINDS: ReadonlySet<Classification> = new Set([
  "inaccuracy",
  "mistake",
  "costly",
  "missedWin",
]);

export function buildAggregate(
  reports: readonly ReportSummary[],
  window: number,
): DashboardAggregate {
  // Newest first, then take the window — "your last 50 games" must mean the
  // most recent 50, not an arbitrary 50.
  const scoped = [...reports].sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, window);

  const withAccuracy = scoped.filter((r) => r.accuracy !== null);
  const meanAccuracy = average(withAccuracy.map((r) => r.accuracy as number));

  return {
    window,
    gamesAnalyzed: scoped.length,
    accuracy: stat(round(meanAccuracy), withAccuracy.length),
    blunderRateByPhase: phaseBreakdown(scoped),
    byOpening: splitBy(
      scoped,
      (r) => r.eco ?? "unknown",
      (r) => (r.openingName ? `${r.eco ?? ""} ${r.openingName}`.trim() : "Unknown opening"),
    ),
    byColor: splitBy(
      scoped,
      (r) => r.color,
      (r) => (r.color === "white" ? "As White" : "As Black"),
    ),
    byTimeControl: splitBy(
      scoped,
      (r) => r.speed,
      (r) => r.speed,
    ),
    timeTrouble: timeTroubleShare(scoped),
    accuracyTrend: [...withAccuracy]
      .sort((a, b) => a.playedAt.localeCompare(b.playedAt))
      .map((r) => ({ playedAt: r.playedAt, accuracy: r.accuracy as number })),
  };
}

function phaseBreakdown(reports: readonly ReportSummary[]): PhaseBreakdown {
  const phases = ["opening", "middlegame", "endgame"] as const;
  const out = {} as Record<(typeof phases)[number], Stat>;

  for (const phase of phases) {
    const count = reports.reduce(
      (sum, r) =>
        sum +
        r.mistakes.filter((m) => m.phase === phase && MISTAKE_KINDS.has(m.classification)).length,
      0,
    );
    // Per-game rate, so a longer window does not look worse than a short one.
    out[phase] = stat(round(reports.length === 0 ? 0 : count / reports.length), reports.length);
  }
  return out;
}

/**
 * Time-trouble indicator (US-E1).
 *
 * The share of the player's mistakes that happened on a low clock. Sample size
 * is the number of *mistakes*, not games — a player with 40 clean games has no
 * evidence about time trouble either way, and reporting 0% would be a claim we
 * cannot support.
 */
function timeTroubleShare(reports: readonly ReportSummary[]): Stat {
  const mistakes = reports.flatMap((r) =>
    r.mistakes.filter((m) => MISTAKE_KINDS.has(m.classification)),
  );
  if (mistakes.length === 0) return { kind: "insufficient", sample: 0, needed: MIN_SAMPLE };
  const low = mistakes.filter((m) => m.lowClock).length;
  return stat(round((low / mistakes.length) * 100), mistakes.length);
}

function splitBy(
  reports: readonly ReportSummary[],
  key: (r: ReportSummary) => string,
  label: (r: ReportSummary) => string,
): SplitRow[] {
  const groups = new Map<string, ReportSummary[]>();
  for (const report of reports) {
    const k = key(report);
    groups.set(k, [...(groups.get(k) ?? []), report]);
  }

  return [...groups.entries()]
    .map(([k, rows]) => {
      const wins = rows.filter((r) => r.result === "win").length;
      const draws = rows.filter((r) => r.result === "draw").length;
      const withAccuracy = rows.filter((r) => r.accuracy !== null);
      return {
        key: k,
        label: label(rows[0]),
        games: rows.length,
        // Score, not bare win rate: a draw is half a point, and reporting draws
        // as losses would misrepresent a solid player as a losing one.
        winRate: stat(round(((wins + draws * 0.5) / rows.length) * 100), rows.length),
        accuracy: stat(
          round(average(withAccuracy.map((r) => r.accuracy as number))),
          withAccuracy.length,
        ),
      };
    })
    .sort((a, b) => b.games - a.games);
}

// ---------------------------------------------------------------- weaknesses

export type Weakness = {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  /** Games that evidence it — US-E2 requires ≥ 5 concrete examples. */
  readonly exampleGameIds: readonly string[];
  readonly occurrences: number;
};

/** US-E2: a weakness must be backed by at least this many linked examples. */
export const MIN_WEAKNESS_EXAMPLES = 5;

/**
 * Top recurring weaknesses (US-E2).
 *
 * The methodology is deliberately simple and stated in the copy, because US-E2
 * requires it be explainable rather than a black box. A pattern is only
 * reported when it appears in at least `MIN_WEAKNESS_EXAMPLES` distinct games —
 * "you blundered once in the endgame" is not a weakness, it is a Tuesday.
 */
export function detectWeaknesses(
  reports: readonly ReportSummary[],
  limit = 3,
): readonly Weakness[] {
  const candidates: Weakness[] = [];

  for (const phase of ["opening", "middlegame", "endgame"] as const) {
    const games = reports.filter((r) =>
      r.mistakes.some((m) => m.phase === phase && MISTAKE_KINDS.has(m.classification)),
    );
    const occurrences = reports.reduce(
      (sum, r) =>
        sum +
        r.mistakes.filter((m) => m.phase === phase && MISTAKE_KINDS.has(m.classification)).length,
      0,
    );
    if (games.length >= MIN_WEAKNESS_EXAMPLES) {
      candidates.push({
        id: `phase:${phase}`,
        title: `Mistakes in the ${phase}`,
        detail: `You made ${occurrences} costly moves in the ${phase} across ${games.length} games.`,
        exampleGameIds: games.map((g) => g.gameId),
        occurrences,
      });
    }
  }

  const timeTroubleGames = reports.filter(
    (r) => r.mistakes.filter((m) => m.lowClock && MISTAKE_KINDS.has(m.classification)).length > 0,
  );
  if (timeTroubleGames.length >= MIN_WEAKNESS_EXAMPLES) {
    const occurrences = reports.reduce(
      (sum, r) =>
        sum + r.mistakes.filter((m) => m.lowClock && MISTAKE_KINDS.has(m.classification)).length,
      0,
    );
    candidates.push({
      id: "time-trouble",
      title: "Mistakes under time pressure",
      detail: `${occurrences} of your mistakes happened with little time left, across ${timeTroubleGames.length} games.`,
      exampleGameIds: timeTroubleGames.map((g) => g.gameId),
      occurrences,
    });
  }

  return candidates.sort((a, b) => b.occurrences - a.occurrences).slice(0, limit);
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
