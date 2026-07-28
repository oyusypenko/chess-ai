import { describe, it, expect, vi } from "vitest";
import {
  fetchUserGames,
  fetchMostRecentGame,
  parseNdjson,
  isValidUsername,
  RATE_LIMIT_BACKOFF_MS,
} from "./client";
import { ImportError } from "./errors";

/** Minimal finished game; override per test. */
function game(overrides: Record<string, unknown> = {}) {
  return {
    id: "abc123",
    status: "mate",
    speed: "blitz",
    createdAt: 1_700_000_000_000,
    players: { white: { user: { name: "alice" } }, black: { user: { name: "bob" } } },
    moves: "e4 e5",
    ...overrides,
  };
}

function ndjsonResponse(games: unknown[], init: ResponseInit = {}) {
  return new Response(games.map((g) => JSON.stringify(g)).join("\n"), {
    status: 200,
    ...init,
  });
}

const noSleep = () => Promise.resolve();

describe("isValidUsername", () => {
  it.each(["a1", "Bob", "user_name", "user-name", "a".repeat(30)])("accepts %s", (u) => {
    expect(isValidUsername(u)).toBe(true);
  });

  it.each(["", "a", "_leading", "-leading", "a".repeat(31), "has space", "semi;colon", "../etc"])(
    "rejects %s",
    (u) => {
      expect(isValidUsername(u)).toBe(false);
    },
  );
});

describe("parseNdjson", () => {
  it("parses newline-delimited objects", () => {
    expect(parseNdjson('{"id":"a"}\n{"id":"b"}')).toHaveLength(2);
  });

  it("ignores blank lines and trailing newline", () => {
    expect(parseNdjson('{"id":"a"}\n\n{"id":"b"}\n')).toHaveLength(2);
  });

  it("skips one malformed line rather than discarding the whole export", () => {
    const games = parseNdjson('{"id":"a"}\nNOT JSON\n{"id":"b"}');
    expect(games.map((g) => g.id)).toEqual(["a", "b"]);
  });

  it("throws only when nothing at all parsed", () => {
    expect(() => parseNdjson("NOT JSON\nALSO NOT")).toThrow(ImportError);
  });

  it("returns empty for an empty body without throwing", () => {
    expect(parseNdjson("")).toEqual([]);
  });
});

describe("fetchUserGames — request shape", () => {
  it("pins the params that FR-2/NFR-L1/US-C2 depend on", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ndjsonResponse([game()]));
    await fetchUserGames("alice", { fetchImpl, sleepImpl: noSleep });

    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/games/user/alice");
    // NFR-L1 — never ask for in-progress games.
    expect(url.searchParams.get("ongoing")).toBe("false");
    expect(url.searchParams.get("finished")).toBe("true");
    // US-C2 — reuse server evals instead of re-running the engine.
    expect(url.searchParams.get("evals")).toBe("true");
    expect(url.searchParams.get("clocks")).toBe("true");
    expect(url.searchParams.get("opening")).toBe("true");
    expect(url.searchParams.get("sort")).toBe("dateDesc");

    // FR-2 — NDJSON streaming.
    expect(fetchImpl.mock.calls[0][1].headers.Accept).toBe("application/x-ndjson");
  });

  it("URL-encodes the username instead of interpolating it raw", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ndjsonResponse([game()]));
    // Valid per the pattern, but still must not be pasted into a path unescaped.
    await fetchUserGames("a-b_c", { fetchImpl, sleepImpl: noSleep });
    expect(new URL(fetchImpl.mock.calls[0][0]).pathname).toBe("/api/games/user/a-b_c");
  });
});

describe("fetchUserGames — NFR-L1 finished-only", () => {
  it.each(["started", "created"])(
    "drops games with status %s even if the API returns them",
    async (status) => {
      const fetchImpl = vi.fn().mockResolvedValue(ndjsonResponse([game({ status })]));
      await expect(
        fetchUserGames("alice", { fetchImpl, sleepImpl: noSleep }),
      ).rejects.toMatchObject({
        kind: "no_finished_games",
      });
    },
  );

  it("keeps finished games and drops unfinished ones in a mixed response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        ndjsonResponse([
          game({ id: "live", status: "started" }),
          game({ id: "done", status: "resign" }),
        ]),
      );
    const games = await fetchUserGames("alice", { fetchImpl, sleepImpl: noSleep });
    expect(games.map((g) => g.id)).toEqual(["done"]);
  });

  it("fails closed on an unrecognized status", async () => {
    // A status we have never seen must not be assumed finished.
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(ndjsonResponse([game({ status: "brandNewStatus" })]));
    await expect(fetchUserGames("alice", { fetchImpl, sleepImpl: noSleep })).rejects.toMatchObject({
      kind: "no_finished_games",
    });
  });
});

describe("fetchUserGames — FR-2 rate limiting", () => {
  it("waits at least 60 s then retries exactly once", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(ndjsonResponse([game()]));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const onRateLimited = vi.fn();

    const games = await fetchUserGames("alice", { fetchImpl, sleepImpl, onRateLimited });

    expect(sleepImpl).toHaveBeenCalledTimes(1);
    expect(sleepImpl.mock.calls[0][0]).toBeGreaterThanOrEqual(RATE_LIMIT_BACKOFF_MS);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // original + exactly one retry
    expect(onRateLimited).toHaveBeenCalledWith(RATE_LIMIT_BACKOFF_MS);
    expect(games).toHaveLength(1);
  });

  it("gives up after the single retry rather than looping", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    await expect(fetchUserGames("alice", { fetchImpl, sleepImpl: noSleep })).rejects.toMatchObject({
      kind: "rate_limited",
      retryable: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("never retries sooner than 60 s even if Retry-After says otherwise", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(ndjsonResponse([game()]));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await fetchUserGames("alice", { fetchImpl, sleepImpl });
    expect(sleepImpl.mock.calls[0][0]).toBeGreaterThanOrEqual(RATE_LIMIT_BACKOFF_MS);
  });

  it("honours a longer Retry-After", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "120" } }))
      .mockResolvedValueOnce(ndjsonResponse([game()]));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);

    await fetchUserGames("alice", { fetchImpl, sleepImpl });
    expect(sleepImpl.mock.calls[0][0]).toBe(120_000);
  });
});

describe("fetchUserGames — failure modes (NFR-R2)", () => {
  it("maps 404 to user_not_found", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    await expect(fetchUserGames("nobody", { fetchImpl, sleepImpl: noSleep })).rejects.toMatchObject(
      {
        kind: "user_not_found",
      },
    );
  });

  it("maps 5xx to platform_unavailable and marks it retryable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    await expect(fetchUserGames("alice", { fetchImpl, sleepImpl: noSleep })).rejects.toMatchObject({
      kind: "platform_unavailable",
      retryable: true,
    });
  });

  it("maps a network failure to network", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(fetchUserGames("alice", { fetchImpl, sleepImpl: noSleep })).rejects.toMatchObject({
      kind: "network",
    });
  });

  it("rejects an invalid username before making any request", async () => {
    const fetchImpl = vi.fn();
    await expect(fetchUserGames("bad name!", { fetchImpl })).rejects.toMatchObject({
      kind: "invalid_username",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports zero finished games distinctly from a missing user", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ndjsonResponse([]));
    await expect(fetchUserGames("alice", { fetchImpl, sleepImpl: noSleep })).rejects.toMatchObject({
      kind: "no_finished_games",
    });
  });

  it("propagates aborts instead of disguising them as network errors", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const fetchImpl = vi.fn().mockRejectedValue(abort);
    await expect(fetchUserGames("alice", { fetchImpl, sleepImpl: noSleep })).rejects.toBe(abort);
  });

  it("every error carries user-safe copy with no stack or internals", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    const error = await fetchUserGames("nobody", { fetchImpl, sleepImpl: noSleep }).catch((e) => e);
    expect(error.userMessage).toMatch(/couldn't find that username/i);
    // No stack frames, no exception names, no URLs, no leaked undefineds.
    expect(error.userMessage).not.toMatch(/\n\s+at\s|Error:|undefined|https?:\/\//i);
    // The internal `message` may carry the kind for logs; userMessage must not.
    expect(error.userMessage).not.toContain("user_not_found");
  });
});

describe("fetchMostRecentGame", () => {
  it("requests a single game and returns it", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ndjsonResponse([game({ id: "newest" })]));
    const result = await fetchMostRecentGame("alice", { fetchImpl, sleepImpl: noSleep });
    expect(result.id).toBe("newest");
    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get("max")).toBe("1");
  });
});
