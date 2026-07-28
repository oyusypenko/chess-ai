import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { buildGroundingFacts, validateGrounding, splitSentences } from "./grounding";
import type { NormalizedGame, NormalizedMove } from "@/model/game";

/**
 * Adversarial by design (US-D1).
 *
 * Happy-path tests here would be worthless: the validator exists precisely for
 * the cases where the model is confidently wrong. Every test below is a shape
 * of hallucination we expect to see in production.
 */

/** Build a real game by replaying SAN, so FENs and UCI are genuine. */
function buildGame(sans: string[]): NormalizedGame {
  const chess = new Chess();
  const moves: NormalizedMove[] = sans.map((san, i) => {
    const fenBefore = chess.fen();
    const color = chess.turn() === "w" ? "white" : "black";
    const move = chess.move(san);
    return {
      ply: i + 1,
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      color,
      fenBefore,
      fenAfter: chess.fen(),
    };
  });

  return {
    id: "g1",
    platform: "lichess",
    url: "https://lichess.org/g1",
    playedAt: "2026-01-01T00:00:00.000Z",
    speed: "blitz",
    timeControl: { kind: "clock", initialSeconds: 300, incrementSeconds: 0 },
    rated: true,
    players: {
      white: { username: "a", rating: 1500, ratingDiff: null, isBot: false },
      black: { username: "b", rating: 1500, ratingDiff: null, isBot: false },
    },
    subject: { username: "a", color: "white", result: "win" },
    status: "mate",
    winner: "white",
    opening: { eco: null, name: null },
    initialFen: new Chess().fen(),
    moves,
    finished: true,
  };
}

const GAME = buildGame(["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O", "Nf6"]);
const FACTS = buildGroundingFacts(GAME);

describe("buildGroundingFacts", () => {
  it("collects every played move", () => {
    expect(FACTS.playedSans.has("e4")).toBe(true);
    expect(FACTS.playedSans.has("Nf3")).toBe(true);
    expect(FACTS.playedSans.has("O-O")).toBe(true);
  });

  it("collects the squares those moves touched", () => {
    expect(FACTS.squares.has("e2")).toBe(true);
    expect(FACTS.squares.has("e4")).toBe(true);
    expect(FACTS.squares.has("g1")).toBe(true);
  });

  it("converts engine UCI lines to SAN so correct references are accepted", () => {
    // The model writes SAN; comparing raw UCI would reject every valid mention
    // of an engine suggestion.
    const withLines = buildGroundingFacts(GAME, new Map([[8, ["d2d4", "e5d4"]]]));
    expect(withLines.engineSans.has("d4")).toBe(true);
    expect(withLines.squares.has("d4")).toBe(true);
  });

  it("ignores an engine line that does not replay legally", () => {
    const withJunk = buildGroundingFacts(GAME, new Map([[8, ["z9z9"]]]));
    expect(withJunk.engineSans.size).toBe(0);
  });
});

describe("validateGrounding — accepts grounded prose", () => {
  it("passes text that only cites real moves", () => {
    const result = validateGrounding(
      "You opened with e4 and developed with Nf3. Castling with O-O was sensible.",
      FACTS,
    );
    expect(result.ok).toBe(true);
    expect(result.droppedSentences).toHaveLength(0);
  });

  it("passes prose with no chess notation at all", () => {
    const result = validateGrounding("You developed quickly and kept your king safe.", FACTS);
    expect(result.ok).toBe(true);
  });

  it("does not trip on ordinary words that look nothing like SAN", () => {
    const result = validateGrounding("Your opening was excellent and the plan was clear.", FACTS);
    expect(result.ok).toBe(true);
  });
});

describe("validateGrounding — catches hallucinations (the point of this file)", () => {
  it("rejects a legal-looking move that was never played", () => {
    const result = validateGrounding("Your move Qh5 was a mistake.", FACTS);
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({ token: "Qh5", kind: "move" });
  });

  it("rejects a move from a DIFFERENT game", () => {
    // The classic failure: plausible chess, wrong game.
    const result = validateGrounding("The rook lift Rd1 gave you the initiative.", FACTS);
    expect(result.ok).toBe(false);
  });

  it("rejects a capture that never happened", () => {
    const result = validateGrounding("Taking with Nxe5 lost a pawn.", FACTS);
    expect(result.ok).toBe(false);
  });

  it("rejects a square never touched in the game", () => {
    const result = validateGrounding("Your knight on h6 was awkward.", FACTS);
    expect(result.ok).toBe(false);
    // `h6` is flagged as a *move* rather than a square, because "h6" is also
    // valid pawn-move SAN — the two token classes genuinely overlap. The `kind`
    // field is for logging; what matters is that the ungrounded token is caught
    // either way, so the assertion is on the token, not the classification.
    expect(result.issues.some((i) => i.token === "h6")).toBe(true);
  });

  it("rejects a rank-1 square reference that cannot be a pawn move", () => {
    // Unambiguously a square, not SAN — exercises the square path directly.
    const result = validateGrounding("Your rook sat on a1 doing nothing.", FACTS);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.token === "a1")).toBe(true);
  });

  it("rejects long castling when only short castling occurred", () => {
    const result = validateGrounding("You went O-O-O to safety.", FACTS);
    expect(result.ok).toBe(false);
  });

  it("rejects a promotion that never happened", () => {
    const result = validateGrounding("Promoting with e8=Q finished it.", FACTS);
    expect(result.ok).toBe(false);
  });

  it("keeps grounded sentences and drops only the offending one", () => {
    const result = validateGrounding(
      "You opened with e4, a good start. Then Qh5 threw away your advantage. Nf3 was solid.",
      FACTS,
    );
    expect(result.ok).toBe(false);
    expect(result.cleanedText).toContain("e4");
    expect(result.cleanedText).toContain("Nf3");
    expect(result.cleanedText).not.toContain("Qh5");
    expect(result.droppedSentences).toHaveLength(1);
  });

  it("can drop every sentence when the whole output is ungrounded", () => {
    const result = validateGrounding("Qh5 was bad. Rd8 was worse.", FACTS);
    expect(result.ok).toBe(false);
    expect(result.cleanedText).toBe("");
  });

  it("accepts a move the ENGINE suggested even though it was not played", () => {
    // Key moments legitimately discuss the move you should have made.
    const facts = buildGroundingFacts(GAME, new Map([[8, ["d2d4"]]]));
    const result = validateGrounding("Instead, d4 would have kept the pressure.", facts);
    expect(result.ok).toBe(true);
  });

  it("still rejects a move that is in neither the game nor any engine line", () => {
    const facts = buildGroundingFacts(GAME, new Map([[8, ["d2d4"]]]));
    expect(validateGrounding("Instead, Qxf7 would have won.", facts).ok).toBe(false);
  });

  it("normalizes check and mate markers rather than rejecting them", () => {
    const game = buildGame(["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7"]);
    const facts = buildGroundingFacts(game);
    // Played as "Qxf7#"; the model may write it with or without the marker.
    expect(validateGrounding("The finish Qxf7 was clean.", facts).ok).toBe(true);
    expect(validateGrounding("The finish Qxf7# was clean.", facts).ok).toBe(true);
  });
});

describe("splitSentences", () => {
  it("splits on sentence boundaries", () => {
    expect(splitSentences("One thing. Another thing. A third.")).toHaveLength(3);
  });

  it("does not shatter on chess notation containing periods", () => {
    // "1. e4" and trailing "e4." are everywhere in chess prose.
    const parts = splitSentences("You played 1. e4 early. That was fine.");
    expect(parts).toHaveLength(2);
  });

  it("handles empty input", () => {
    expect(splitSentences("")).toEqual([]);
  });
});
