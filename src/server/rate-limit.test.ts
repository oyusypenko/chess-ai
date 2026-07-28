import { describe, it, expect } from "vitest";
import {
  checkRateLimit,
  clientIdentifier,
  MemoryRateLimitStore,
  nextUtcMidnight,
  utcDayKey,
  DEMO_LIMIT_PER_DAY,
} from "./rate-limit";

describe("checkRateLimit (US-A1: 3 per IP per day)", () => {
  it("allows exactly the limit and refuses the next one", async () => {
    const store = new MemoryRateLimitStore();
    for (let i = 1; i <= DEMO_LIMIT_PER_DAY; i += 1) {
      const result = await checkRateLimit(store, "1.2.3.4");
      expect(result.allowed, `request ${i} should be allowed`).toBe(true);
    }
    // The 4th is the one that matters.
    const fourth = await checkRateLimit(store, "1.2.3.4");
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it("counts down remaining", async () => {
    const store = new MemoryRateLimitStore();
    expect((await checkRateLimit(store, "ip")).remaining).toBe(2);
    expect((await checkRateLimit(store, "ip")).remaining).toBe(1);
    expect((await checkRateLimit(store, "ip")).remaining).toBe(0);
  });

  it("keeps separate buckets per identifier", async () => {
    const store = new MemoryRateLimitStore();
    for (let i = 0; i < 3; i += 1) await checkRateLimit(store, "a");
    expect((await checkRateLimit(store, "a")).allowed).toBe(false);
    // A different IP is unaffected.
    expect((await checkRateLimit(store, "b")).allowed).toBe(true);
  });

  it("keeps separate buckets per scope", async () => {
    const store = new MemoryRateLimitStore();
    for (let i = 0; i < 3; i += 1) await checkRateLimit(store, "ip", { scope: "demo" });
    expect((await checkRateLimit(store, "ip", { scope: "demo" })).allowed).toBe(false);
    expect((await checkRateLimit(store, "ip", { scope: "report" })).allowed).toBe(true);
  });

  it("resets at 00:00 UTC, not 24h after first use", async () => {
    const store = new MemoryRateLimitStore();
    const late = new Date("2026-03-01T23:59:00.000Z");
    for (let i = 0; i < 3; i += 1) await checkRateLimit(store, "ip", { now: late });
    expect((await checkRateLimit(store, "ip", { now: late })).allowed).toBe(false);

    // One minute later it is a new UTC day and the allowance is fresh.
    const justAfterMidnight = new Date("2026-03-02T00:01:00.000Z");
    expect((await checkRateLimit(store, "ip", { now: justAfterMidnight })).allowed).toBe(true);
  });

  it("reports the reset time so the UI can tell the user when to come back", async () => {
    const store = new MemoryRateLimitStore();
    const result = await checkRateLimit(store, "ip", { now: new Date("2026-03-01T10:00:00.000Z") });
    expect(result.resetsAt).toBe("2026-03-02T00:00:00.000Z");
  });

  it("honours a custom limit", async () => {
    const store = new MemoryRateLimitStore();
    expect((await checkRateLimit(store, "ip", { limit: 1 })).allowed).toBe(true);
    expect((await checkRateLimit(store, "ip", { limit: 1 })).allowed).toBe(false);
  });
});

describe("nextUtcMidnight / utcDayKey", () => {
  it("rolls to the next UTC day", () => {
    expect(new Date(nextUtcMidnight(new Date("2026-03-01T10:00:00Z"))).toISOString()).toBe(
      "2026-03-02T00:00:00.000Z",
    );
  });

  it("handles the last second of a day", () => {
    expect(new Date(nextUtcMidnight(new Date("2026-12-31T23:59:59Z"))).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });

  it("buckets by UTC date", () => {
    expect(utcDayKey(new Date("2026-03-01T23:59:59Z"))).toBe("2026-03-01");
    expect(utcDayKey(new Date("2026-03-02T00:00:00Z"))).toBe("2026-03-02");
  });
});

describe("clientIdentifier", () => {
  function req(headers: Record<string, string>) {
    return new Request("https://example.com", { headers });
  }

  it("prefers CF-Connecting-IP, which the client cannot spoof", () => {
    const id = clientIdentifier(
      req({ "cf-connecting-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" }),
    );
    expect(id).toBe("9.9.9.9");
  });

  it("falls back to the first X-Forwarded-For entry", () => {
    expect(clientIdentifier(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
  });

  it("falls back to X-Real-IP", () => {
    expect(clientIdentifier(req({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
  });

  it("fails closed: unidentifiable callers share one bucket", async () => {
    // If each anonymous caller got a fresh bucket, the limit would be free to
    // bypass by stripping headers.
    const store = new MemoryRateLimitStore();
    const id = clientIdentifier(req({}));
    expect(id).toBe("unknown");
    for (let i = 0; i < 3; i += 1) await checkRateLimit(store, id);
    expect((await checkRateLimit(store, clientIdentifier(req({})))).allowed).toBe(false);
  });
});
