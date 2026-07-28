import { describe, it, expect } from "vitest";
import {
  parseInfoLine,
  parseBestMove,
  sideToMove,
  toPositionEval,
  goCommand,
  positionCommand,
  setOption,
} from "./uci";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const BLACK_TO_MOVE = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

describe("sideToMove", () => {
  it("reads the side-to-move field from a FEN", () => {
    expect(sideToMove(START)).toBe("white");
    expect(sideToMove(BLACK_TO_MOVE)).toBe("black");
  });
});

/**
 * The sign convention is the highest-risk behaviour in the engine layer: UCI
 * reports scores from the side to move, our model stores White POV. These
 * tests are the guard.
 */
describe("parseInfoLine — score sign correction (White POV)", () => {
  it("keeps the sign when White is to move", () => {
    const info = parseInfoLine("info depth 20 score cp 55 nodes 1000 pv e2e4", "white");
    expect(info?.cp).toBe(55);
  });

  it("FLIPS the sign when Black is to move", () => {
    // "+120 for the side to move" with Black to move means White is losing.
    const info = parseInfoLine("info depth 20 score cp 120 nodes 1000 pv e7e5", "black");
    expect(info?.cp).toBe(-120);
  });

  it("flips a negative score for Black too", () => {
    // Black to move and losing → good for White.
    const info = parseInfoLine("info depth 18 score cp -300 pv e7e5", "black");
    expect(info?.cp).toBe(300);
  });

  it("flips mate scores as well", () => {
    expect(parseInfoLine("info depth 30 score mate 3 pv e2e4", "white")?.mate).toBe(3);
    // Black to move mating in 3 = mate against White.
    expect(parseInfoLine("info depth 30 score mate 3 pv e7e5", "black")?.mate).toBe(-3);
    expect(parseInfoLine("info depth 30 score mate -2 pv e7e5", "black")?.mate).toBe(2);
  });

  it("never reports cp and mate together", () => {
    const info = parseInfoLine("info depth 30 score mate 2 pv e2e4", "white");
    expect(info?.mate).toBe(2);
    expect(info?.cp).toBeUndefined();
  });
});

describe("parseInfoLine — fields", () => {
  it("parses a full info line", () => {
    const info = parseInfoLine(
      "info depth 22 seldepth 30 multipv 1 score cp 34 nodes 1234567 nps 900000 time 1370 pv e2e4 e7e5 g1f3",
      "white",
    );
    expect(info).toMatchObject({
      depth: 22,
      seldepth: 30,
      multipv: 1,
      cp: 34,
      nodes: 1234567,
      nps: 900000,
      timeMs: 1370,
      pv: ["e2e4", "e7e5", "g1f3"],
    });
  });

  it("captures the whole pv, including promotions", () => {
    const info = parseInfoLine("info depth 10 score cp 900 pv a7a8q b1c3", "white");
    expect(info?.pv).toEqual(["a7a8q", "b1c3"]);
  });

  it("records score bounds so callers know a score is not exact", () => {
    expect(parseInfoLine("info depth 5 score cp 20 lowerbound pv e2e4", "white")?.bound).toBe(
      "lower",
    );
    expect(parseInfoLine("info depth 5 score cp 20 upperbound pv e2e4", "white")?.bound).toBe(
      "upper",
    );
  });

  it("ignores non-info and info string lines", () => {
    expect(parseInfoLine("readyok", "white")).toBeNull();
    expect(
      parseInfoLine("info string NNUE evaluation using nn-4ca89e4b3abf.nnue", "white"),
    ).toBeNull();
  });

  it("ignores progress chatter with no evaluation content", () => {
    expect(parseInfoLine("info currmove e2e4 currmovenumber 1", "white")).toBeNull();
  });

  it("survives a truncated line rather than throwing", () => {
    expect(() => parseInfoLine("info depth", "white")).not.toThrow();
    expect(() => parseInfoLine("info score cp", "white")).not.toThrow();
  });
});

describe("parseBestMove", () => {
  it("parses bestmove with ponder", () => {
    expect(parseBestMove("bestmove e2e4 ponder e7e5")).toEqual({
      bestmove: "e2e4",
      ponder: "e7e5",
    });
  });

  it("parses bestmove without ponder", () => {
    expect(parseBestMove("bestmove g1f3")).toEqual({ bestmove: "g1f3", ponder: undefined });
  });

  it("returns null bestmove in terminal positions", () => {
    // Stockfish emits `(none)` at mate/stalemate — not an error, just no move.
    expect(parseBestMove("bestmove (none)")?.bestmove).toBeNull();
  });

  it("ignores other lines", () => {
    expect(parseBestMove("info depth 1 score cp 0")).toBeNull();
  });
});

describe("toPositionEval", () => {
  it("prefers mate over cp and tags provenance (US-C2)", () => {
    expect(toPositionEval({ mate: -2, cp: 500, depth: 30 })).toEqual({
      mate: -2,
      provenance: "local-engine",
      depth: 30,
    });
  });

  it("maps cp when there is no mate", () => {
    expect(toPositionEval({ cp: 41, depth: 18 })).toEqual({
      cp: 41,
      provenance: "local-engine",
      depth: 18,
    });
  });

  it("returns undefined when there is no score", () => {
    expect(toPositionEval({ depth: 4 })).toBeUndefined();
  });
});

describe("commands", () => {
  it("builds a position command from a FEN", () => {
    expect(positionCommand(START)).toBe(`position fen ${START}`);
  });

  it("sets BOTH depth and nodes so whichever lands first stops the search (US-C1)", () => {
    expect(goCommand({ depth: 18, nodes: 1_000_000 })).toBe("go depth 18 nodes 1000000");
  });

  it("builds setoption commands", () => {
    expect(setOption("Threads", 4)).toBe("setoption name Threads value 4");
    expect(setOption("UCI_ShowWDL", true)).toBe("setoption name UCI_ShowWDL value true");
  });
});
