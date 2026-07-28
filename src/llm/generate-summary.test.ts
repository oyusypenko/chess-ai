import { describe, it, expect, vi } from "vitest";
import { Chess } from "chess.js";
import { generateSummary, enforceWordLimit, MAX_WORDS, isOverBudget } from "./generate-summary";
import { LlmUnavailableError, type LlmProvider, type LlmResponse } from "./provider";
import type { NormalizedGame, NormalizedMove } from "@/model/game";
import type { ReportPayload } from "@/report/build-payload";

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
      black: { username: "b", rating: 1400, ratingDiff: null, isBot: false },
    },
    subject: { username: "a", color: "white", result: "win" },
    status: "mate",
    winner: "white",
    opening: { eco: "C50", name: "Italian Game" },
    initialFen: new Chess().fen(),
    moves,
    finished: true,
  };
}

const GAME = buildGame(["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O", "Nf6"]);

const PAYLOAD: ReportPayload = {
  subjectColor: "white",
  result: "win",
  timeControl: "5+0 (blitz)",
  opening: "Italian Game",
  subjectRating: 1500,
  opponentRating: 1400,
  accuracy: 88,
  counts: { good: 3, inaccuracy: 1 },
  keyMoments: [],
  timeTrouble: false,
};

function provider(texts: string[]): LlmProvider & { calls: number } {
  let calls = 0;
  return {
    name: "stub",
    model: "stub-model",
    get calls() {
      return calls;
    },
    async complete(): Promise<LlmResponse> {
      const text = texts[Math.min(calls, texts.length - 1)];
      calls += 1;
      return {
        text,
        model: "stub-model",
        usage: { inputTokens: 1000, outputTokens: 200, costUsd: 0.002 },
      };
    },
  } as LlmProvider & { calls: number };
}

describe("generateSummary — the US-D1 contract", () => {
  it("returns grounded text on the first attempt", async () => {
    const p = provider(["You opened with e4 and developed with Nf3. Solid play."]);
    const result = await generateSummary({ provider: p, game: GAME, payload: PAYLOAD });

    expect(result.status).toBe("ok");
    expect(result.attempts).toBe(1);
    expect(result.text).toContain("e4");
  });

  it("regenerates EXACTLY once when the first attempt hallucinates", async () => {
    const p = provider([
      "Your move Qh5 was a blunder.", // ungrounded
      "You opened with e4 and developed with Nf3.", // clean
    ]);
    const result = await generateSummary({ provider: p, game: GAME, payload: PAYLOAD });

    expect(result.status).toBe("regenerated");
    expect(result.attempts).toBe(2);
    expect(result.text).not.toContain("Qh5");
  });

  it("tells the model WHAT was wrong on retry rather than blindly repeating", async () => {
    const complete = vi
      .fn()
      .mockResolvedValueOnce({
        text: "Your move Qh5 was bad.",
        model: "m",
        usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      })
      .mockResolvedValueOnce({
        text: "You played e4.",
        model: "m",
        usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      });

    await generateSummary({
      provider: { name: "s", model: "m", complete } as LlmProvider,
      game: GAME,
      payload: PAYLOAD,
    });

    const retryMessages = complete.mock.calls[1][0].messages;
    const retryText = retryMessages.map((m: { content: string }) => m.content).join("\n");
    expect(retryText).toContain("Qh5");
    expect(retryText).toMatch(/do not (exist|appear)/i);
  });

  it("STRIPS ungrounded sentences when the retry also hallucinates", async () => {
    const p = provider([
      "Qh5 was a blunder.",
      "You opened with e4. Then Rd8 lost the thread. Nf3 was fine.",
    ]);
    const result = await generateSummary({ provider: p, game: GAME, payload: PAYLOAD });

    expect(result.status).toBe("stripped");
    expect(result.attempts).toBe(2);
    expect(result.text).toContain("e4");
    expect(result.text).toContain("Nf3");
    // The guarantee: a hallucinated move never renders.
    expect(result.text).not.toContain("Rd8");
  });

  it("never makes a third attempt", async () => {
    const p = provider(["Qh5 bad.", "Rd8 worse.", "Bb5 worst."]);
    const result = await generateSummary({ provider: p, game: GAME, payload: PAYLOAD });
    expect(result.attempts).toBe(2);
    expect(p.calls).toBe(2);
  });

  it("returns empty text rather than anything ungrounded when everything fails", async () => {
    const p = provider(["Qh5 bad.", "Rd8 worse."]);
    const result = await generateSummary({ provider: p, game: GAME, payload: PAYLOAD });
    expect(result.text).toBe("");
    // An empty summary is a correct outcome — the caller degrades to the
    // engine-only report rather than showing invented analysis.
  });
});

describe("generateSummary — degradation (NFR-R1)", () => {
  it("raises LlmUnavailableError when the provider throws", async () => {
    const failing: LlmProvider = {
      name: "s",
      model: "m",
      complete: async () => {
        throw new Error("connect ECONNREFUSED");
      },
    };
    await expect(
      generateSummary({ provider: failing, game: GAME, payload: PAYLOAD }),
    ).rejects.toBeInstanceOf(LlmUnavailableError);
  });
});

describe("generateSummary — reproducibility (FR-4)", () => {
  it("returns the prompt version and model with every result", async () => {
    const p = provider(["You played e4."]);
    const result = await generateSummary({ provider: p, game: GAME, payload: PAYLOAD });
    expect(result.promptVersion).toBeTruthy();
    expect(result.model).toBe("stub-model");
  });

  it("accumulates usage across attempts so cost reflects retries", async () => {
    const p = provider(["Qh5 bad.", "You played e4."]);
    const result = await generateSummary({ provider: p, game: GAME, payload: PAYLOAD });
    // Two attempts at 0.002 each.
    expect(result.usage?.costUsd).toBeCloseTo(0.004);
    expect(result.usage?.inputTokens).toBe(2000);
  });

  it("reports usage per attempt for telemetry", async () => {
    const seen: number[] = [];
    const p = provider(["You played e4."]);
    await generateSummary({
      provider: p,
      game: GAME,
      payload: PAYLOAD,
      onUsage: (u) => seen.push(u.costUsd),
    });
    expect(seen).toHaveLength(1);
  });
});

describe("word limit (US-D1: ≤250 words)", () => {
  it("leaves short text untouched", () => {
    expect(enforceWordLimit("Short and sweet.", MAX_WORDS)).toBe("Short and sweet.");
  });

  it("truncates at a sentence boundary rather than mid-sentence", () => {
    const long = `${"word ".repeat(240)}. Second sentence here that goes past the limit ${"more ".repeat(30)}.`;
    const result = enforceWordLimit(long, MAX_WORDS);
    expect(result.split(/\s+/).length).toBeLessThanOrEqual(MAX_WORDS);
    expect(result.endsWith(".")).toBe(true);
  });

  it("enforces the limit on generated output", async () => {
    const p = provider([`You played e4. ${"and developed well ".repeat(120)}`]);
    const result = await generateSummary({ provider: p, game: GAME, payload: PAYLOAD });
    expect(result.text.split(/\s+/).length).toBeLessThanOrEqual(MAX_WORDS);
  });
});

describe("cost budget (US-D1: ≤ $0.02)", () => {
  it("flags usage over budget", () => {
    expect(isOverBudget({ inputTokens: 0, outputTokens: 0, costUsd: 0.03 })).toBe(true);
    expect(isOverBudget({ inputTokens: 0, outputTokens: 0, costUsd: 0.01 })).toBe(false);
    expect(isOverBudget(null)).toBe(false);
  });
});
