import { describe, it, expect } from "vitest";
import { normalizeLichessGame } from "./normalize";
import type { LichessGame } from "./types";
import { perspective } from "@/model/game";

function raw(overrides: Partial<LichessGame> = {}): LichessGame {
  return {
    id: "abc123",
    status: "mate",
    speed: "blitz",
    rated: true,
    createdAt: 1_700_000_000_000,
    winner: "white",
    players: {
      white: { user: { name: "Alice" }, rating: 1500, ratingDiff: 8 },
      black: { user: { name: "bob" }, rating: 1480, ratingDiff: -8 },
    },
    clock: { initial: 300, increment: 3 },
    opening: { eco: "C50", name: "Italian Game" },
    moves: "e4 e5 Nf3 Nc6 Bc4",
    ...overrides,
  };
}

describe("normalizeLichessGame — NFR-L1", () => {
  it.each(["started", "created", "brandNewStatus"])("refuses status %s", (status) => {
    expect(() => normalizeLichessGame(raw({ status }), "Alice")).toThrow(/no_finished_games/);
  });

  it("produces finished: true (the literal) for a finished game", () => {
    expect(normalizeLichessGame(raw(), "Alice").finished).toBe(true);
  });
});

describe("normalizeLichessGame — subject resolution", () => {
  it("matches the subject case-insensitively", () => {
    // Lichess displays chosen casing but matches case-insensitively; getting
    // this wrong would write the report about the opponent.
    expect(normalizeLichessGame(raw(), "alice").subject.color).toBe("white");
    expect(normalizeLichessGame(raw(), "ALICE").subject.color).toBe("white");
    expect(normalizeLichessGame(raw(), "Bob").subject.color).toBe("black");
  });

  it("throws when the subject did not play in the game", () => {
    expect(() => normalizeLichessGame(raw(), "carol")).toThrow(/malformed_response/);
  });

  it("reports result from the subject's POV, not the winner's", () => {
    expect(normalizeLichessGame(raw({ winner: "white" }), "Alice").subject.result).toBe("win");
    expect(normalizeLichessGame(raw({ winner: "white" }), "bob").subject.result).toBe("loss");
    expect(normalizeLichessGame(raw({ winner: undefined }), "Alice").subject.result).toBe("draw");
  });
});

describe("normalizeLichessGame — move replay", () => {
  it("derives ply, colour, SAN and UCI by replaying", () => {
    const game = normalizeLichessGame(raw(), "Alice");
    expect(game.moves).toHaveLength(5);

    expect(game.moves[0]).toMatchObject({ ply: 1, san: "e4", uci: "e2e4", color: "white" });
    expect(game.moves[1]).toMatchObject({ ply: 2, san: "e5", uci: "e7e5", color: "black" });
    expect(game.moves[4]).toMatchObject({ ply: 5, san: "Bc4", uci: "f1c4", color: "white" });
  });

  it("ply is 1-based and colour alternates from White", () => {
    const game = normalizeLichessGame(raw(), "Alice");
    for (const [i, move] of game.moves.entries()) {
      expect(move.ply).toBe(i + 1);
      expect(move.color).toBe(i % 2 === 0 ? "white" : "black");
    }
  });

  it("fenBefore of a move equals fenAfter of the previous one", () => {
    const game = normalizeLichessGame(raw(), "Alice");
    for (let i = 1; i < game.moves.length; i += 1) {
      expect(game.moves[i].fenBefore).toBe(game.moves[i - 1].fenAfter);
    }
  });

  it("handles an empty move list", () => {
    expect(normalizeLichessGame(raw({ moves: "" }), "Alice").moves).toEqual([]);
  });

  it("keeps the legal prefix when the move list goes corrupt", () => {
    const game = normalizeLichessGame(raw({ moves: "e4 e5 Qxq9 Nf3" }), "Alice");
    expect(game.moves.map((m) => m.san)).toEqual(["e4", "e5"]);
  });

  it("encodes promotion in UCI", () => {
    const game = normalizeLichessGame(
      raw({
        initialFen: "8/P6k/8/8/8/8/7K/8 w - - 0 1",
        moves: "a8=Q",
        opening: undefined,
      }),
      "Alice",
    );
    expect(game.moves[0].uci).toBe("a7a8q");
  });

  it("handles castling and en passant", () => {
    const game = normalizeLichessGame(raw({ moves: "e4 e5 Nf3 Nf6 Bc4 Bc5 O-O O-O" }), "Alice");
    expect(game.moves[6]).toMatchObject({ san: "O-O", uci: "e1g1", color: "white" });
    expect(game.moves[7]).toMatchObject({ san: "O-O", uci: "e8g8", color: "black" });
  });
});

describe("normalizeLichessGame — parallel array alignment", () => {
  it("aligns clocks[i] with ply i+1", () => {
    const game = normalizeLichessGame(
      raw({ clocks: [30000, 29500, 29000, 28500, 28000] }),
      "Alice",
    );
    expect(game.moves[0].clockCentis).toBe(30000);
    expect(game.moves[4].clockCentis).toBe(28000);
  });

  it("aligns analysis[i] with ply i+1 and tags provenance (US-C2)", () => {
    const game = normalizeLichessGame(
      raw({
        analysis: [{ eval: 25 }, { eval: 18 }, { eval: 30 }, { eval: -150 }, { eval: 40 }],
      }),
      "Alice",
    );
    expect(game.moves[0].evalAfter).toEqual({ cp: 25, provenance: "lichess-server" });
    // The blunder is on ply 4 (Black's 2nd move) — an off-by-one here would
    // attribute it to White.
    expect(game.moves[3].evalAfter).toEqual({ cp: -150, provenance: "lichess-server" });
    expect(game.moves[3].color).toBe("black");
  });

  it("keeps mate distinct from centipawns", () => {
    const game = normalizeLichessGame(raw({ analysis: [{ mate: 3 }, { eval: 20 }] }), "Alice");
    expect(game.moves[0].evalAfter).toEqual({ mate: 3, provenance: "lichess-server" });
    expect(game.moves[0].evalAfter?.cp).toBeUndefined();
  });

  it("leaves evals undefined when the game was never analyzed", () => {
    const game = normalizeLichessGame(raw({ analysis: undefined }), "Alice");
    expect(game.moves.every((m) => m.evalAfter === undefined)).toBe(true);
  });

  it("tolerates analysis shorter than the move list", () => {
    const game = normalizeLichessGame(raw({ analysis: [{ eval: 25 }] }), "Alice");
    expect(game.moves[0].evalAfter).toBeDefined();
    expect(game.moves[1].evalAfter).toBeUndefined();
  });
});

describe("normalizeLichessGame — metadata", () => {
  it("maps players, opening, time control and rated flag", () => {
    const game = normalizeLichessGame(raw(), "Alice");
    expect(game.players.white).toMatchObject({ username: "Alice", rating: 1500, ratingDiff: 8 });
    expect(game.opening).toEqual({ eco: "C50", name: "Italian Game" });
    expect(game.timeControl).toEqual({ kind: "clock", initialSeconds: 300, incrementSeconds: 3 });
    expect(game.rated).toBe(true);
    expect(game.url).toBe("https://lichess.org/abc123");
    expect(game.playedAt).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it("detects bot opponents", () => {
    const game = normalizeLichessGame(
      raw({ players: { white: { user: { name: "Alice" } }, black: { aiLevel: 5 } } }),
      "Alice",
    );
    expect(game.players.black.isBot).toBe(true);
    expect(game.players.white.isBot).toBe(false);
  });

  it("maps correspondence time control", () => {
    const game = normalizeLichessGame(
      raw({ clock: undefined, daysPerTurn: 3, speed: "correspondence" }),
      "Alice",
    );
    expect(game.timeControl).toEqual({ kind: "correspondence", daysPerTurn: 3 });
  });

  it("falls back gracefully on missing optional metadata", () => {
    const game = normalizeLichessGame(
      raw({ opening: undefined, clock: undefined, rated: undefined, speed: undefined }),
      "Alice",
    );
    expect(game.opening).toEqual({ eco: null, name: null });
    expect(game.rated).toBe(false);
    expect(game.timeControl).toEqual({ kind: "unlimited" });
  });
});

describe("perspective helper", () => {
  it("flips the sign for Black so a White-POV eval reads correctly", () => {
    const whitePovCp = -150; // Black is winning
    expect(whitePovCp * perspective("white")).toBe(-150);
    expect(whitePovCp * perspective("black")).toBe(150);
  });
});
