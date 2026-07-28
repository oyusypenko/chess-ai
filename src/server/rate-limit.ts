/**
 * Server-side rate limiting (US-A1, US-F1).
 *
 * **Server-side is the whole point.** A client-side counter is a suggestion; a
 * user who wants more reports just clears storage. This is the only thing
 * standing between the demo and an unbounded LLM bill, so it lives here and
 * every gated route calls it.
 *
 * Storage is pluggable because the backing store is a P0/P1 decision we have
 * not had to make yet (D-05 moved us off Redis to Cloudflare KV or Durable
 * Objects). The in-memory store below is correct for a single instance and
 * explicitly *not* correct across a Worker fleet — swap it before real traffic.
 */

export type RateLimitResult = {
  readonly allowed: boolean;
  /** Requests still available in the current window. */
  readonly remaining: number;
  readonly limit: number;
  /** When the window resets, ISO 8601. */
  readonly resetsAt: string;
};

export interface RateLimitStore {
  /**
   * Atomically increment and return the new count for `key`.
   *
   * `nowMs` is passed in rather than read from the clock inside: the caller
   * already decided what "now" is when it computed `expiresAt`, and a store
   * that consults a second clock can disagree with it. That is not merely a
   * testing inconvenience — it is two sources of truth for one decision.
   */
  increment(key: string, expiresAt: number, nowMs: number): Promise<number>;
}

/** US-A1: 3 demo reports per IP per day, resetting 00:00 UTC. */
export const DEMO_LIMIT_PER_DAY = 3;

/**
 * In-memory store — correct for one process, wrong for a fleet.
 *
 * Kept deliberately small and obvious rather than clever: it exists so local
 * development and tests exercise the same code path production will, and so
 * the limit is never silently absent. Cloudflare KV/DO replaces this at deploy.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  #counts = new Map<string, { count: number; expiresAt: number }>();

  async increment(key: string, expiresAt: number, nowMs: number): Promise<number> {
    const existing = this.#counts.get(key);
    if (!existing || existing.expiresAt <= nowMs) {
      this.#counts.set(key, { count: 1, expiresAt });
      return 1;
    }
    existing.count += 1;
    return existing.count;
  }

  /** Test helper — never called in production paths. */
  reset(): void {
    this.#counts.clear();
  }
}

/** Start of the next UTC day, in epoch ms. US-A1 specifies a 00:00 UTC reset. */
export function nextUtcMidnight(now: Date = new Date()): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.getTime();
}

/** The UTC date portion, used to bucket a day's requests. */
export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function checkRateLimit(
  store: RateLimitStore,
  identifier: string,
  options: { limit?: number; now?: Date; scope?: string } = {},
): Promise<RateLimitResult> {
  const limit = options.limit ?? DEMO_LIMIT_PER_DAY;
  const now = options.now ?? new Date();
  const resetsAtMs = nextUtcMidnight(now);
  const key = `${options.scope ?? "demo"}:${utcDayKey(now)}:${identifier}`;

  const count = await store.increment(key, resetsAtMs, now.getTime());

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    limit,
    resetsAt: new Date(resetsAtMs).toISOString(),
  };
}

/**
 * Best-effort client IP.
 *
 * Order matters: `CF-Connecting-IP` is set by Cloudflare and cannot be spoofed
 * by the client, so it is trusted first. `X-Forwarded-For` **can** be spoofed
 * when it is not set by our own edge, so it is a fallback only — and we take
 * the first entry, which is the closest thing to an origin that header offers.
 *
 * Returning a constant for an unidentifiable caller is deliberate: they all
 * share one bucket rather than each getting a fresh allowance, which fails
 * closed.
 */
export function clientIdentifier(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();

  return "unknown";
}
