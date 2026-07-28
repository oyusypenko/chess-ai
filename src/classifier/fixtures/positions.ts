import type { Color } from "@/model/game";
import type { Classification } from "../thresholds";

/**
 * Curated classification fixtures (US-C4 — **≥ 50 required, CI-gated**).
 *
 * **These are the spec, not a regression net.** New behaviour gets its fixture
 * written first; a threshold change that moves a fixture is a decision to
 * record in `docs/decisions.md`, not a test to quietly update.
 *
 * Evals are White POV, as everywhere else in the codebase. Cases are built to
 * exercise the bug classes that actually bite in this domain:
 *   - both colours at every band (a Black blunder is a *positive* White-POV delta)
 *   - exact threshold boundaries
 *   - mate scores vs centipawns
 *   - promotion, castling, en passant
 *   - decided positions, where centipawn-based classifiers misbehave
 */

export type Fixture = {
  readonly name: string;
  readonly fenBefore: string;
  readonly fenAfter: string;
  readonly san: string;
  readonly mover: Color;
  readonly evalBefore: { cp?: number; mate?: number };
  readonly evalAfter: { cp?: number; mate?: number };
  readonly bestLine?: readonly string[];
  readonly isBook?: boolean;
  readonly expected: Classification;
  /** Why this case exists — keeps the suite reviewable. */
  readonly rationale: string;
};

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
const AFTER_E4_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";
const ITALIAN = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
const ITALIAN_OO = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4";

/** Symmetric pair helper: the same magnitude of loss for White and for Black. */
function pair(
  base: Omit<Fixture, "mover" | "evalBefore" | "evalAfter" | "name"> & { name: string },
  whiteCp: [number, number],
): Fixture[] {
  return [
    {
      ...base,
      name: `${base.name} (White)`,
      mover: "white",
      evalBefore: { cp: whiteCp[0] },
      evalAfter: { cp: whiteCp[1] },
    },
    {
      // Mirror: same loss magnitude but Black is moving, so the White-POV evals
      // move the other way. This is the sign-convention guard.
      ...base,
      name: `${base.name} (Black — mirrored)`,
      mover: "black",
      evalBefore: { cp: -whiteCp[0] },
      evalAfter: { cp: -whiteCp[1] },
    },
  ];
}

export const FIXTURES: readonly Fixture[] = [
  // ---------------------------------------------------------------- best/excellent
  {
    name: "played the engine's top move",
    fenBefore: ITALIAN,
    fenAfter: ITALIAN_OO,
    san: "O-O",
    mover: "white",
    evalBefore: { cp: 30 },
    evalAfter: { cp: 28 },
    bestLine: ["e1g1", "g8f6"],
    expected: "best",
    rationale: "Matching the engine's first choice is 'best' regardless of tiny residual loss.",
  },
  {
    name: "castling short, matching engine",
    fenBefore: ITALIAN,
    fenAfter: ITALIAN_OO,
    san: "O-O",
    mover: "white",
    evalBefore: { cp: 25 },
    evalAfter: { cp: 25 },
    bestLine: ["e1g1"],
    expected: "best",
    rationale: "Castling must resolve to UCI e1g1 to compare with the engine line.",
  },
  ...pair(
    {
      name: "negligible loss",
      fenBefore: ITALIAN,
      fenAfter: ITALIAN_OO,
      san: "O-O",
      expected: "excellent",
      rationale: "Under the 0.02 band — practically the engine's move.",
    },
    [30, 28],
  ),
  ...pair(
    {
      name: "tiny loss just under the good boundary",
      fenBefore: ITALIAN,
      fenAfter: ITALIAN_OO,
      san: "O-O",
      expected: "excellent",
      rationale: "Just below 0.02 must stay excellent — boundary guard.",
    },
    [0, 4],
  ),

  // ---------------------------------------------------------------- good
  ...pair(
    {
      name: "small imprecision",
      fenBefore: ITALIAN,
      fenAfter: ITALIAN_OO,
      san: "O-O",
      expected: "good",
      rationale: "Between 0.02 and 0.10 — sound but not exact.",
    },
    [40, 0],
  ),
  ...pair(
    {
      name: "moderate imprecision still good",
      fenBefore: ITALIAN,
      fenAfter: ITALIAN_OO,
      san: "O-O",
      expected: "good",
      rationale: "Upper part of the good band.",
    },
    [60, 10],
  ),

  // ---------------------------------------------------------------- inaccuracy
  ...pair(
    {
      name: "gave up real equity",
      fenBefore: ITALIAN,
      fenAfter: ITALIAN_OO,
      san: "O-O",
      expected: "inaccuracy",
      rationale: "At or above the 0.10 band — gave up equity worth reviewing.",
    },
    [100, -10],
  ),
  ...pair(
    {
      name: "inaccuracy near the mistake boundary",
      fenBefore: ITALIAN,
      fenAfter: ITALIAN_OO,
      san: "O-O",
      expected: "inaccuracy",
      rationale: "Just under 0.20 must remain inaccuracy.",
    },
    [120, -30],
  ),

  // ---------------------------------------------------------------- mistake
  ...pair(
    {
      name: "changed the assessment",
      fenBefore: ITALIAN,
      fenAfter: ITALIAN_OO,
      san: "O-O",
      expected: "mistake",
      rationale: "At or above the 0.20 band — the assessment of the position changed.",
    },
    [150, -100],
  ),
  ...pair(
    {
      name: "mistake near the costly boundary",
      fenBefore: ITALIAN,
      fenAfter: ITALIAN_OO,
      san: "O-O",
      expected: "mistake",
      rationale: "Just under 0.30 must remain mistake.",
    },
    [170, -120],
  ),

  // ---------------------------------------------------------------- costly
  ...pair(
    {
      name: "turned the game around",
      fenBefore: ITALIAN,
      fenAfter: ITALIAN_OO,
      san: "O-O",
      expected: "costly",
      rationale: "At or above the 0.30 band — decisive swing that flips the game.",
    },
    [200, -300],
  ),
  ...pair(
    {
      name: "catastrophic collapse",
      fenBefore: ITALIAN,
      fenAfter: ITALIAN_OO,
      san: "O-O",
      expected: "costly",
      rationale: "Very large loss stays in the top band, never overflows it.",
    },
    [200, -800],
  ),

  // ---------------------------------------------------------------- decided positions
  // The reason we classify on win probability, not centipawns: a 200 cp swing
  // deep in a won game changes almost nothing.
  ...pair(
    {
      name: "200cp swing while already winning",
      fenBefore: ITALIAN,
      fenAfter: ITALIAN_OO,
      san: "O-O",
      expected: "excellent",
      rationale:
        "A centipawn-threshold classifier would call this a mistake; win probability barely moves because the game was already decided.",
    },
    [1500, 1300],
  ),
  ...pair(
    {
      name: "200cp swing while already lost",
      fenBefore: ITALIAN,
      fenAfter: ITALIAN_OO,
      san: "O-O",
      expected: "excellent",
      rationale: "Symmetric case on the losing side — also barely moves.",
    },
    [-1500, -1700],
  ),

  // ---------------------------------------------------------------- mate handling
  {
    name: "mate score preserved, not flattened to centipawns",
    fenBefore: ITALIAN,
    fenAfter: ITALIAN_OO,
    san: "O-O",
    mover: "white",
    evalBefore: { mate: 3 },
    evalAfter: { mate: 2 },
    expected: "excellent",
    rationale: "Converting a mate faster is not a loss.",
  },
  {
    name: "threw away a forced mate",
    fenBefore: ITALIAN,
    fenAfter: ITALIAN_OO,
    san: "O-O",
    mover: "white",
    evalBefore: { mate: 2 },
    evalAfter: { cp: 20 },
    expected: "missedWin",
    rationale: "Winning → not winning is the missed-win case, not a plain blunder.",
  },
  {
    name: "Black threw away a forced mate",
    fenBefore: AFTER_E4,
    fenAfter: AFTER_E4_E5,
    san: "e5",
    mover: "black",
    evalBefore: { mate: -2 },
    evalAfter: { cp: -20 },
    expected: "missedWin",
    rationale: "Mirror of the above; mate sign is negative for Black.",
  },
  {
    name: "walked into mate",
    fenBefore: ITALIAN,
    fenAfter: ITALIAN_OO,
    san: "O-O",
    mover: "white",
    evalBefore: { cp: 50 },
    evalAfter: { mate: -1 },
    expected: "costly",
    rationale: "Equal → getting mated is the worst band.",
  },
  {
    name: "Black walked into mate",
    fenBefore: AFTER_E4,
    fenAfter: AFTER_E4_E5,
    san: "e5",
    mover: "black",
    evalBefore: { cp: -50 },
    evalAfter: { mate: 1 },
    expected: "costly",
    rationale: "Sign-flip guard on the mate path.",
  },

  // ---------------------------------------------------------------- missed win
  {
    name: "winning position let slip",
    fenBefore: ITALIAN,
    fenAfter: ITALIAN_OO,
    san: "O-O",
    mover: "white",
    evalBefore: { cp: 600 },
    evalAfter: { cp: 60 },
    expected: "missedWin",
    rationale: "Was ≥0.85 win prob, dropped below 0.65.",
  },
  {
    name: "Black let a win slip",
    fenBefore: AFTER_E4,
    fenAfter: AFTER_E4_E5,
    san: "e5",
    mover: "black",
    evalBefore: { cp: -600 },
    evalAfter: { cp: -60 },
    expected: "missedWin",
    rationale: "Mirrored — the mover's own win probability is what matters.",
  },
  {
    name: "big loss but was never winning → plain mistake",
    fenBefore: ITALIAN,
    fenAfter: ITALIAN_OO,
    san: "O-O",
    mover: "white",
    evalBefore: { cp: 100 },
    evalAfter: { cp: -150 },
    expected: "mistake",
    rationale:
      "Guard: missedWin must not swallow every large loss — this one was never winning, so it stays on the plain ladder.",
  },

  // ---------------------------------------------------------------- book
  {
    name: "opening theory",
    fenBefore: START,
    fenAfter: AFTER_E4,
    san: "e4",
    mover: "white",
    evalBefore: { cp: 20 },
    evalAfter: { cp: 25 },
    isBook: true,
    expected: "book",
    rationale: "Book flag wins over the loss ladder.",
  },
  {
    name: "book move that loses equity is still book",
    fenBefore: START,
    fenAfter: AFTER_E4,
    san: "e4",
    mover: "white",
    evalBefore: { cp: 30 },
    evalAfter: { cp: -60 },
    isBook: true,
    expected: "book",
    rationale: "We do not scold a player for following theory.",
  },

  // ---------------------------------------------------------------- brilliant
  {
    name: "sound knight sacrifice",
    // Fried Liver, real position: Ng5xf7 offers the knight (200cp net after the
    // pawn) and Kxf7 is forced. FENs derived with chess.js, not hand-written —
    // an earlier version of this fixture was illegal chess and silently passed
    // through the classifier's error handling as "no sacrifice".
    fenBefore: "r1bqkb1r/ppp2ppp/2n5/3np1N1/2B5/8/PPPP1PPP/RNBQK2R w KQkq - 0 6",
    fenAfter: "r1bqkb1r/ppp2Npp/2n5/3np3/2B5/8/PPPP1PPP/RNBQK2R b KQkq - 0 6",
    san: "Nxf7",
    mover: "white",
    evalBefore: { cp: 30 },
    evalAfter: { cp: 35 },
    expected: "brilliant",
    rationale: "Real material given up, still best, position not already won.",
  },
  {
    name: "sacrifice in an already-won position is not brilliant",
    fenBefore: "r1bqkb1r/ppp2ppp/2n5/3np1N1/2B5/8/PPPP1PPP/RNBQK2R w KQkq - 0 6",
    fenAfter: "r1bqkb1r/ppp2Npp/2n5/3np3/2B5/8/PPPP1PPP/RNBQK2R b KQkq - 0 6",
    san: "Nxf7",
    mover: "white",
    evalBefore: { cp: 1800 },
    evalAfter: { cp: 1850 },
    expected: "excellent",
    rationale: "Badge must stay rare — routine sacs in won games do not qualify.",
  },
  {
    name: "material loss that is NOT sound is not brilliant",
    fenBefore: "r1bqkb1r/ppp2ppp/2n5/3np1N1/2B5/8/PPPP1PPP/RNBQK2R w KQkq - 0 6",
    fenAfter: "r1bqkb1r/ppp2Npp/2n5/3np3/2B5/8/PPPP1PPP/RNBQK2R b KQkq - 0 6",
    san: "Nxf7",
    mover: "white",
    evalBefore: { cp: 30 },
    evalAfter: { cp: -400 },
    expected: "costly",
    rationale: "A sacrifice the engine dislikes is just a blunder.",
  },

  {
    name: "Greek gift bishop sacrifice",
    fenBefore: "rnbq1rk1/ppp1bppp/4pn2/3p4/3P4/3BPN2/PPPN1PPP/R1BQK2R w KQ - 4 6",
    fenAfter: "rnbq1rk1/ppp1bppB/4pn2/3p4/3P4/4PN2/PPPN1PPP/R1BQK2R b KQ - 0 6",
    san: "Bxh7+",
    mover: "white",
    evalBefore: { cp: 40 },
    evalAfter: { cp: 45 },
    expected: "brilliant",
    rationale:
      "Second, independent sacrifice shape (bishop for pawn, 220cp offered) so the detector is not tuned to one position.",
  },
  {
    name: "capture that is merely an even trade is not brilliant",
    fenBefore: "r1bqkb1r/ppp2ppp/2n5/3np1N1/2B5/8/PPPP1PPP/RNBQK2R w KQkq - 0 6",
    fenAfter: "r1bqkb1r/ppp2Npp/2n5/3np3/2B5/8/PPPP1PPP/RNBQK2R b KQkq - 0 6",
    san: "Nxf7",
    mover: "white",
    evalBefore: { cp: 30 },
    evalAfter: { cp: 35 },
    isBook: true,
    expected: "book",
    rationale: "Book classification must win over brilliant — theory is theory.",
  },

  // ---------------------------------------------------------------- promotion
  {
    name: "queen promotion",
    fenBefore: "8/P6k/8/8/8/8/7K/8 w - - 0 1",
    fenAfter: "Q7/7k/8/8/8/8/7K/8 b - - 0 1",
    san: "a8=Q",
    mover: "white",
    evalBefore: { cp: 700 },
    evalAfter: { mate: 8 },
    bestLine: ["a7a8q"],
    expected: "best",
    rationale: "Promotion UCI must carry the piece suffix to match the engine line.",
  },
  {
    name: "underpromotion that throws the win",
    fenBefore: "8/P6k/8/8/8/8/7K/8 w - - 0 1",
    fenAfter: "N7/7k/8/8/8/8/7K/8 b - - 0 1",
    san: "a8=N",
    mover: "white",
    evalBefore: { cp: 900 },
    evalAfter: { cp: 0 },
    expected: "missedWin",
    rationale: "Underpromotion is a real move and must classify on its merits.",
  },

  // ---------------------------------------------------------------- en passant
  {
    name: "en passant capture",
    fenBefore: "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3",
    fenAfter: "rnbqkbnr/ppp1p1pp/5P2/3p4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3",
    san: "exf6",
    mover: "white",
    evalBefore: { cp: 40 },
    evalAfter: { cp: 45 },
    bestLine: ["e5f6"],
    expected: "best",
    rationale: "En passant must resolve to the correct UCI square pair.",
  },

  // ---------------------------------------------------------------- missing data
  {
    name: "no eval before",
    fenBefore: ITALIAN,
    fenAfter: ITALIAN_OO,
    san: "O-O",
    mover: "white",
    evalBefore: {},
    evalAfter: { cp: 20 },
    expected: "good",
    rationale: "Missing data must yield a neutral label, never a confident wrong one.",
  },
  {
    name: "no eval after",
    fenBefore: ITALIAN,
    fenAfter: ITALIAN_OO,
    san: "O-O",
    mover: "white",
    evalBefore: { cp: 20 },
    evalAfter: {},
    expected: "good",
    rationale: "Same on the other side.",
  },

  // ---------------------------------------------------------------- improvement
  ...pair(
    {
      name: "position improved for the mover",
      fenBefore: ITALIAN,
      fenAfter: ITALIAN_OO,
      san: "O-O",
      expected: "excellent",
      rationale: "Loss clamps at zero — you are never punished for improving.",
    },
    [0, 300],
  ),
  ...pair(
    {
      name: "large improvement",
      fenBefore: ITALIAN,
      fenAfter: ITALIAN_OO,
      san: "O-O",
      expected: "excellent",
      rationale: "Opponent-blunder follow-ups must not be mislabelled.",
    },
    [-200, 400],
  ),

  // ---------------------------------------------------------------- equal positions
  ...pair(
    {
      name: "dead equal, no change",
      fenBefore: ITALIAN,
      fenAfter: ITALIAN_OO,
      san: "O-O",
      expected: "excellent",
      rationale: "Zero loss is the floor case.",
    },
    [0, 0],
  ),
];

/** US-C4 requires at least 50. Asserted in the test suite, not just documented. */
export const MINIMUM_FIXTURES = 50;
