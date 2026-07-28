import { describe, it, expect } from "vitest";
import { classifyMove, classifyByLoss, materialSacrificed } from "./classify";
import { winProbability, winProbabilityLoss, winProbabilityFromCp } from "./win-probability";
import { LOSS_BANDS, LOSS_THRESHOLDS, CLASSIFICATIONS } from "./thresholds";
import { FIXTURES, MINIMUM_FIXTURES } from "./fixtures/positions";
import type { PositionEval } from "@/model/game";

const cp = (n: number): PositionEval => ({ cp: n, provenance: "local-engine", depth: 18 });
const mate = (n: number): PositionEval => ({ mate: n, provenance: "local-engine", depth: 18 });

describe("win probability model", () => {
  it("is 0.5 at a dead-equal position", () => {
    expect(winProbabilityFromCp(0)).toBeCloseTo(0.5, 6);
  });

  it("puts +100cp at ~0.60, the documented calibration point", () => {
    expect(winProbabilityFromCp(100)).toBeCloseTo(0.6, 3);
  });

  it("is symmetric about zero", () => {
    expect(winProbabilityFromCp(-250)).toBeCloseTo(1 - winProbabilityFromCp(250), 9);
  });

  it("is monotonic increasing", () => {
    const points = [-2000, -800, -300, -100, 0, 100, 300, 800, 2000];
    const values = points.map(winProbabilityFromCp);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it("saturates rather than exceeding [0,1]", () => {
    expect(winProbabilityFromCp(100_000)).toBeLessThanOrEqual(1);
    expect(winProbabilityFromCp(-100_000)).toBeGreaterThanOrEqual(0);
  });

  it("treats mate as near-certainty and prefers shorter mates", () => {
    expect(winProbability(mate(1))).toBeGreaterThan(0.99);
    expect(winProbability(mate(1))).toBeGreaterThan(winProbability(mate(8)));
    expect(winProbability(mate(-1))).toBeLessThan(0.01);
    expect(winProbability(mate(-1))).toBeLessThan(winProbability(mate(-8)));
  });

  it("mate outranks any centipawn score", () => {
    expect(winProbability(mate(5))).toBeGreaterThan(winProbability(cp(1900)));
  });
});

/**
 * The sign convention is the highest-risk logic in the classifier: evals are
 * White POV, loss is mover POV.
 */
describe("winProbabilityLoss — perspective", () => {
  it("charges White for a White-POV drop", () => {
    expect(winProbabilityLoss(cp(100), cp(-100), "white")).toBeGreaterThan(0);
  });

  it("charges Black for a White-POV RISE", () => {
    // White's eval going up is bad for Black.
    expect(winProbabilityLoss(cp(-100), cp(100), "black")).toBeGreaterThan(0);
  });

  it("gives mirrored positions identical loss", () => {
    const whiteLoss = winProbabilityLoss(cp(100), cp(-100), "white");
    const blackLoss = winProbabilityLoss(cp(-100), cp(100), "black");
    expect(blackLoss).toBeCloseTo(whiteLoss, 9);
  });

  it("clamps improvement to zero rather than reporting negative loss", () => {
    expect(winProbabilityLoss(cp(0), cp(400), "white")).toBe(0);
    expect(winProbabilityLoss(cp(0), cp(-400), "black")).toBe(0);
  });
});

describe("classifyByLoss — band boundaries", () => {
  it("resolves an exact boundary into the MORE severe band, deterministically", () => {
    expect(classifyByLoss(LOSS_THRESHOLDS.inaccuracy)).toBe("inaccuracy");
    expect(classifyByLoss(LOSS_THRESHOLDS.mistake)).toBe("mistake");
    expect(classifyByLoss(LOSS_THRESHOLDS.costly)).toBe("costly");
  });

  it("stays in the lower band just below each boundary", () => {
    expect(classifyByLoss(LOSS_THRESHOLDS.inaccuracy - 1e-9)).toBe("good");
    expect(classifyByLoss(LOSS_THRESHOLDS.mistake - 1e-9)).toBe("inaccuracy");
    expect(classifyByLoss(LOSS_THRESHOLDS.costly - 1e-9)).toBe("mistake");
  });

  it("bands are ascending and cover from zero", () => {
    expect(LOSS_BANDS[0].min).toBe(0);
    for (let i = 1; i < LOSS_BANDS.length; i += 1) {
      expect(LOSS_BANDS[i].min).toBeGreaterThan(LOSS_BANDS[i - 1].min);
    }
  });

  it("every band has a written rationale (US-E2 explainability)", () => {
    for (const band of LOSS_BANDS) {
      expect(band.why.length).toBeGreaterThan(20);
    }
  });

  it("playing the engine's move is best regardless of residual loss", () => {
    expect(classifyByLoss(0.5, true)).toBe("best");
  });
});

describe("materialSacrificed", () => {
  // Fried Liver. All FENs here are derived with chess.js rather than written by
  // hand — an earlier version of this suite contained an illegal position
  // (a knight on f3 "capturing" f7) which passed silently, because the
  // classifier catches parse errors and reports no sacrifice.
  const FRIED_LIVER_BEFORE = "r1bqkb1r/ppp2ppp/2n5/3np1N1/2B5/8/PPPP1PPP/RNBQK2R w KQkq - 0 6";
  const FRIED_LIVER_AFTER = "r1bqkb1r/ppp2Npp/2n5/3np3/2B5/8/PPPP1PPP/RNBQK2R b KQkq - 0 6";

  it("detects a knight offered for a pawn (net 200)", () => {
    // Knight (300) takes a pawn (100) and can be recaptured by the king.
    expect(materialSacrificed(FRIED_LIVER_BEFORE, FRIED_LIVER_AFTER, "Nxf7")).toBe(200);
  });

  it("detects a bishop offered for a pawn (Greek gift, net 220)", () => {
    expect(
      materialSacrificed(
        "rnbq1rk1/ppp1bppp/4pn2/3p4/3P4/3BPN2/PPPN1PPP/R1BQK2R w KQ - 4 6",
        "rnbq1rk1/ppp1bppB/4pn2/3p4/3P4/4PN2/PPPN1PPP/R1BQK2R b KQ - 0 6",
        "Bxh7+",
      ),
    ).toBe(220);
  });

  it("reports zero for a quiet move that hangs nothing", () => {
    const before = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
    const after = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4";
    expect(materialSacrificed(before, after, "O-O")).toBe(0);
  });

  it("reports zero for an illegal or unparseable move rather than throwing", () => {
    expect(materialSacrificed(FRIED_LIVER_BEFORE, FRIED_LIVER_AFTER, "Qxz9")).toBe(0);
  });
});

// ---------------------------------------------------------------- the fixture suite

describe("fixture suite (US-C4 — the spec)", () => {
  it(`has at least ${MINIMUM_FIXTURES} positions`, () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(MINIMUM_FIXTURES);
  });

  it("every fixture states why it exists", () => {
    for (const fixture of FIXTURES) {
      expect(fixture.rationale.length, `${fixture.name} has no rationale`).toBeGreaterThan(15);
    }
  });

  it("covers both colours", () => {
    expect(FIXTURES.some((f) => f.mover === "white")).toBe(true);
    expect(FIXTURES.some((f) => f.mover === "black")).toBe(true);
  });

  it.each(FIXTURES.map((f) => [f.name, f] as const))("%s", (_name, fixture) => {
    const result = classifyMove({
      fenBefore: fixture.fenBefore,
      fenAfter: fixture.fenAfter,
      san: fixture.san,
      mover: fixture.mover,
      evalBefore:
        Object.keys(fixture.evalBefore).length === 0
          ? undefined
          : { ...fixture.evalBefore, provenance: "local-engine", depth: 18 },
      evalAfter:
        Object.keys(fixture.evalAfter).length === 0
          ? undefined
          : { ...fixture.evalAfter, provenance: "local-engine", depth: 18 },
      bestLine: fixture.bestLine,
      isBook: fixture.isBook,
    });

    expect(
      result.classification,
      `${fixture.name}: expected ${fixture.expected}, got ${result.classification} (loss ${result.loss.toFixed(4)})`,
    ).toBe(fixture.expected);
  });
});

describe("determinism (US-C4)", () => {
  it("produces byte-identical output across repeated runs", () => {
    const run = () =>
      JSON.stringify(
        FIXTURES.map((f) =>
          classifyMove({
            fenBefore: f.fenBefore,
            fenAfter: f.fenAfter,
            san: f.san,
            mover: f.mover,
            evalBefore:
              Object.keys(f.evalBefore).length === 0
                ? undefined
                : { ...f.evalBefore, provenance: "local-engine", depth: 18 },
            evalAfter:
              Object.keys(f.evalAfter).length === 0
                ? undefined
                : { ...f.evalAfter, provenance: "local-engine", depth: 18 },
            bestLine: f.bestLine,
            isBook: f.isBook,
          }),
        ),
      );
    expect(run()).toBe(run());
    expect(run()).toBe(run());
  });
});

describe("category metadata (NFR-L2)", () => {
  it("uses our own vocabulary, not chess.com's badge names", () => {
    // Guard against drift toward their branding. "Blunder" is generic chess
    // vocabulary but their glyph set is not; we use "Costly" deliberately.
    expect(CLASSIFICATIONS).toContain("costly");
    expect(CLASSIFICATIONS).not.toContain("blunder");
    expect(CLASSIFICATIONS).not.toContain("greatMove");
  });

  it("assigns a severity to every category", () => {
    for (const c of CLASSIFICATIONS) {
      const result = classifyMove({
        fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        fenAfter: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
        san: "e4",
        mover: "white",
        evalBefore: cp(0),
        evalAfter: cp(0),
      });
      expect(typeof result.severity).toBe("number");
      expect(c.length).toBeGreaterThan(0);
    }
  });

  it("accuracy is 100 for a perfect move and falls as loss rises", () => {
    const perfect = classifyMove({
      fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      fenAfter: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
      san: "e4",
      mover: "white",
      evalBefore: cp(0),
      evalAfter: cp(0),
    });
    expect(perfect.accuracy).toBe(100);
  });
});
