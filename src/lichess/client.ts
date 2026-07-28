import { importError, ImportError } from "./errors";
import { isFinished, type LichessGame } from "./types";

/**
 * Lichess game-export client (FR-2, US-B1).
 *
 * Two rules from FR-2 are non-negotiable and implemented here rather than left
 * to callers:
 *   - NDJSON streaming for exports.
 *   - On 429: wait >= 60 s, retry EXACTLY once, then surface a designed state.
 *     Never hammer. The wait is long because Lichess's limiter is per-IP and a
 *     tight retry loop gets the whole deployment blocked, not just one user.
 *
 * NFR-L1: `ongoing=false` and `finished=true` are pinned on every request, and
 * every returned game is re-checked against the finished allow-list. The query
 * param is the platform's promise; the check is ours.
 */

const API_BASE = "https://lichess.org";

/** FR-2: minimum wait before the single permitted retry. */
export const RATE_LIMIT_BACKOFF_MS = 60_000;

/** Lichess usernames: 2–30 chars, alphanumeric plus _ and -, must start alnum. */
const USERNAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,29}$/;

export type FetchGamesOptions = {
  /** How many finished games to request. US-B1 defaults to 20. */
  max?: number;
  signal?: AbortSignal;
  /** Injected for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected for tests so the 60 s backoff does not slow the suite. */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Called when we hit a 429 and are about to wait — drives the UI state. */
  onRateLimited?: (waitMs: number) => void;
};

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Fetch a user's most recent finished games, newest first.
 *
 * Returns raw Lichess objects; normalization is a separate step so the
 * transport concerns and the shape concerns stay testable apart.
 */
export async function fetchUserGames(
  username: string,
  options: FetchGamesOptions = {},
): Promise<LichessGame[]> {
  const { max = 20, signal, fetchImpl = fetch, sleepImpl = defaultSleep, onRateLimited } = options;

  // NFR-S2: validate before it reaches a URL.
  if (!isValidUsername(username)) throw importError("invalid_username");

  const url = new URL(`/api/games/user/${encodeURIComponent(username)}`, API_BASE);
  url.searchParams.set("max", String(max));
  url.searchParams.set("moves", "true");
  url.searchParams.set("tags", "true");
  url.searchParams.set("clocks", "true"); // time-trouble analysis (US-E1)
  url.searchParams.set("evals", "true"); // reuse server evals (US-C2)
  url.searchParams.set("opening", "true"); // ECO + name (US-B1)
  url.searchParams.set("sort", "dateDesc");
  url.searchParams.set("finished", "true");
  url.searchParams.set("ongoing", "false"); // NFR-L1 — never in-progress games

  const request = () =>
    fetchImpl(url.toString(), {
      method: "GET",
      headers: { Accept: "application/x-ndjson" },
      signal,
    });

  let response: Response;
  try {
    response = await request();
  } catch (cause) {
    if (isAbort(cause)) throw cause;
    throw importError("network", { cause });
  }

  // FR-2: one wait, one retry. Not a loop — a loop is how an IP gets banned.
  if (response.status === 429) {
    const waitMs = retryAfterMs(response) ?? RATE_LIMIT_BACKOFF_MS;
    onRateLimited?.(waitMs);
    await sleepImpl(waitMs);
    try {
      response = await request();
    } catch (cause) {
      if (isAbort(cause)) throw cause;
      throw importError("network", { cause });
    }
    if (response.status === 429) throw importError("rate_limited", { retryable: true });
  }

  if (response.status === 404) throw importError("user_not_found");
  if (response.status >= 500) {
    throw importError("platform_unavailable", { retryable: true });
  }
  if (!response.ok) {
    throw importError("platform_unavailable", { retryable: response.status >= 500 });
  }

  const body = await readBody(response, signal);
  const games = parseNdjson(body);

  // NFR-L1, defense in depth: the query said finished-only; verify it anyway.
  // A platform bug or an API change must not put a live game into analysis.
  const finishedOnly = games.filter((g) => isFinished(g.status));

  if (finishedOnly.length === 0) throw importError("no_finished_games");
  return finishedOnly;
}

/** Fetch just the most recent finished game (US-A1, the P0 demo path). */
export async function fetchMostRecentGame(
  username: string,
  options: FetchGamesOptions = {},
): Promise<LichessGame> {
  const games = await fetchUserGames(username, { ...options, max: options.max ?? 1 });
  const game = games[0];
  if (!game) throw importError("no_finished_games");
  return game;
}

async function readBody(response: Response, signal?: AbortSignal): Promise<string> {
  try {
    return await response.text();
  } catch (cause) {
    if (isAbort(cause) || signal?.aborted) throw cause;
    throw importError("network", { cause });
  }
}

/**
 * Parse newline-delimited JSON.
 *
 * A single malformed line must not discard the whole export — some games
 * carrying a field we choke on is not a reason to tell the user we found
 * nothing. Skip the bad line, keep the rest; only a wholly unparseable body is
 * an error.
 */
export function parseNdjson(body: string): LichessGame[] {
  const lines = body.split("\n").filter((line) => line.trim().length > 0);
  const games: LichessGame[] = [];
  let failures = 0;

  for (const line of lines) {
    try {
      games.push(JSON.parse(line) as LichessGame);
    } catch {
      failures += 1;
    }
  }

  if (games.length === 0 && failures > 0) throw importError("malformed_response");
  return games;
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  // Honour the platform's number, but never retry sooner than FR-2 allows.
  return Math.max(seconds * 1000, RATE_LIMIT_BACKOFF_MS);
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export { ImportError };
