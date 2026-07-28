import { describe, it, expect } from "vitest";
import {
  buildAggregate,
  detectWeaknesses,
  stat,
  MIN_SAMPLE,
  MIN_WEAKNESS_EXAMPLES,
  type ReportSummary,
} from "./aggregate";

function report(overrides: Partial<ReportSummary> = {}): ReportSummary {
  return {
    gameId: `g${Math.random()}`,
    playedAt: "2026-03-01T00:00:00.000Z",
    speed: "blitz",
    color: "white",
    result: "win",
    eco: "C50",
    openingName: "Italian Game",
    accuracy: 85,
    counts: {},
    mistakes: [],
    ...overrides,
  };
}

function many(n: number, overrides: Partial<ReportSummary> = {}): ReportSummary[] {
  return Array.from({ length: n }, (_, i) =>
    report({
      gameId: `g${i}`,
      playedAt: `2026-03-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
      ...overrides,
    }),
  );
}

describe("stat — the minimum-sample rule (US-E1)", () => {
  it("reports a value once the sample is large enough", () => {
    expect(stat(88, MIN_SAMPLE)).toEqual({ kind: "value", value: 88, sample: MIN_SAMPLE });
  });

  it("refuses to report a number below the threshold", () => {
    // The whole point: a misleading number is worse than an honest gap.
    const result = stat(100, MIN_SAMPLE - 1);
    expect(result.kind).toBe("insufficient");
    expect(result).toMatchObject({ sample: 9, needed: 10 });
  });

  it("makes the insufficient case impossible to render as a value", () => {
    const result = stat(50, 2);
    // A caller cannot read `.value` without narrowing — that is the type doing
    // the work rather than a convention nobody follows.
    expect("value" in result).toBe(false);
  });
});

describe("buildAggregate", () => {
  it("takes the most recent N games, not an arbitrary N", () => {
    const reports = many(30);
    const aggregate = buildAggregate(reports, 25);
    expect(aggregate.gamesAnalyzed).toBe(25);
    // Newest games must be the ones kept.
    expect(aggregate.accuracyTrend.at(-1)?.playedAt).toBe("2026-03-30T00:00:00.000Z");
  });

  it("does not invent games it does not have", () => {
    expect(buildAggregate(many(3), 100).gamesAnalyzed).toBe(3);
  });

  it("suppresses accuracy below the minimum sample", () => {
    expect(buildAggregate(many(5), 25).accuracy.kind).toBe("insufficient");
    expect(buildAggregate(many(10), 25).accuracy.kind).toBe("value");
  });

  it("ignores games with no accuracy rather than counting them as zero", () => {
    const mixed = [...many(10, { accuracy: 90 }), ...many(5, { accuracy: null })];
    const aggregate = buildAggregate(mixed, 100);
    expect(aggregate.accuracy).toMatchObject({ kind: "value", value: 90, sample: 10 });
  });

  it("orders the accuracy trend oldest to newest for plotting", () => {
    const trend = buildAggregate(many(12), 100).accuracyTrend;
    for (let i = 1; i < trend.length; i += 1) {
      expect(trend[i].playedAt >= trend[i - 1].playedAt).toBe(true);
    }
  });
});

describe("blunder rate by phase (US-E1)", () => {
  it("reports mistakes per game, so window size does not skew it", () => {
    const reports = many(20, {
      mistakes: [{ ply: 30, classification: "mistake", phase: "middlegame", lowClock: false }],
    });
    const aggregate = buildAggregate(reports, 20);
    expect(aggregate.blunderRateByPhase.middlegame).toMatchObject({ kind: "value", value: 1 });
    expect(aggregate.blunderRateByPhase.opening).toMatchObject({ kind: "value", value: 0 });
  });

  it("suppresses phase rates below the minimum sample", () => {
    expect(buildAggregate(many(4), 25).blunderRateByPhase.opening.kind).toBe("insufficient");
  });

  it("counts only real mistakes, not good moves", () => {
    const reports = many(10, {
      mistakes: [
        { ply: 1, classification: "excellent", phase: "opening", lowClock: false },
        { ply: 2, classification: "costly", phase: "opening", lowClock: false },
      ],
    });
    expect(buildAggregate(reports, 25).blunderRateByPhase.opening).toMatchObject({ value: 1 });
  });
});

describe("time-trouble indicator (US-E1)", () => {
  it("reports the share of mistakes made on a low clock", () => {
    const reports = many(10, {
      mistakes: [
        { ply: 40, classification: "costly", phase: "middlegame", lowClock: true },
        { ply: 42, classification: "mistake", phase: "middlegame", lowClock: false },
      ],
    });
    expect(buildAggregate(reports, 25).timeTrouble).toMatchObject({ kind: "value", value: 50 });
  });

  it("samples MISTAKES, not games — clean games are no evidence either way", () => {
    // 40 games with two mistakes total cannot support a time-trouble claim.
    const reports = [
      ...many(38),
      report({
        gameId: "x",
        mistakes: [{ ply: 40, classification: "costly", phase: "endgame", lowClock: true }],
      }),
    ];
    expect(buildAggregate(reports, 100).timeTrouble.kind).toBe("insufficient");
  });

  it("reports insufficient rather than 0% when there are no mistakes at all", () => {
    // 0% would be a claim we cannot support, not a compliment.
    expect(buildAggregate(many(50), 100).timeTrouble.kind).toBe("insufficient");
  });
});

describe("splits by opening / colour / time control", () => {
  it("groups and sorts by game count", () => {
    const reports = [
      ...many(12, { eco: "C50", openingName: "Italian Game" }),
      ...many(4, { eco: "B20", openingName: "Sicilian" }),
    ];
    const rows = buildAggregate(reports, 100).byOpening;
    expect(rows[0].key).toBe("C50");
    expect(rows[0].games).toBe(12);
  });

  it("counts a draw as half a point, not a loss", () => {
    const reports = [...many(5, { result: "win" }), ...many(5, { result: "draw" })];
    // 5 wins + 5 draws over 10 games = 75%, not 50%.
    expect(buildAggregate(reports, 100).byColor[0].winRate).toMatchObject({ value: 75 });
  });

  it("suppresses a split with too few games", () => {
    const reports = [...many(12, { color: "white" }), ...many(3, { color: "black" })];
    const rows = buildAggregate(reports, 100).byColor;
    expect(rows.find((r) => r.key === "white")?.winRate.kind).toBe("value");
    expect(rows.find((r) => r.key === "black")?.winRate.kind).toBe("insufficient");
  });
});

describe("recurring weaknesses (US-E2)", () => {
  it("requires at least five linked example games", () => {
    const four = many(4, {
      mistakes: [{ ply: 50, classification: "costly", phase: "endgame", lowClock: false }],
    });
    expect(detectWeaknesses(four)).toHaveLength(0);

    const five = many(5, {
      mistakes: [{ ply: 50, classification: "costly", phase: "endgame", lowClock: false }],
    });
    const found = detectWeaknesses(five);
    expect(found).toHaveLength(1);
    expect(found[0].exampleGameIds.length).toBeGreaterThanOrEqual(MIN_WEAKNESS_EXAMPLES);
  });

  it("links concrete games, not just a count", () => {
    const reports = many(6, {
      mistakes: [{ ply: 12, classification: "mistake", phase: "opening", lowClock: false }],
    });
    const [weakness] = detectWeaknesses(reports);
    expect(weakness.exampleGameIds).toContain("g0");
  });

  it("detects time trouble as its own pattern", () => {
    const reports = many(8, {
      mistakes: [{ ply: 45, classification: "costly", phase: "middlegame", lowClock: true }],
    });
    expect(detectWeaknesses(reports).some((w) => w.id === "time-trouble")).toBe(true);
  });

  it("returns the top 3, most frequent first", () => {
    const reports = many(10, {
      mistakes: [
        { ply: 5, classification: "inaccuracy", phase: "opening", lowClock: false },
        { ply: 30, classification: "mistake", phase: "middlegame", lowClock: true },
        { ply: 31, classification: "costly", phase: "middlegame", lowClock: true },
        { ply: 60, classification: "mistake", phase: "endgame", lowClock: false },
      ],
    });
    const found = detectWeaknesses(reports, 3);
    expect(found.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < found.length; i += 1) {
      expect(found[i - 1].occurrences).toBeGreaterThanOrEqual(found[i].occurrences);
    }
  });

  it("finds nothing for a clean player rather than inventing a weakness", () => {
    expect(detectWeaknesses(many(50))).toHaveLength(0);
  });
});
