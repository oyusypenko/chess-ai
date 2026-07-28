import { describe, it, expect, beforeEach } from "vitest";
import { sqliteDb, type Db } from "@/db/client";
import { migrate } from "@/db/index";
import {
  checkLoginAllowed,
  checkRegisterAllowed,
  clearLoginFailures,
  purgeExpiredThrottles,
  recordLoginFailure,
  LOGIN_MAX_ATTEMPTS_PER_EMAIL,
  LOGIN_MAX_ATTEMPTS_PER_IP,
  LOGIN_WINDOW_MS,
  REGISTER_MAX_PER_IP,
} from "./auth-throttle";

/**
 * Sign-in throttling (NFR-S1).
 *
 * Time is injected everywhere. A throttle tested against the real clock either
 * sleeps (slow) or never exercises expiry at all (useless) — and expiry is
 * exactly where a fixed-window counter goes wrong.
 */

const T0 = Date.UTC(2026, 6, 1, 12, 0, 0);

let db: Db;
beforeEach(async () => {
  db = await sqliteDb(":memory:");
  await migrate(db);
});

const identity = { email: "player@example.com", ip: "203.0.113.7" };

async function failTimes(n: number, at = T0, who = identity) {
  for (let i = 0; i < n; i += 1) await recordLoginFailure(db, who, at);
}

describe("per-email throttling", () => {
  it("allows a fresh identity", async () => {
    expect((await checkLoginAllowed(db, identity, T0)).allowed).toBe(true);
  });

  it("allows attempts right up to the limit", async () => {
    await failTimes(LOGIN_MAX_ATTEMPTS_PER_EMAIL - 1);
    expect((await checkLoginAllowed(db, identity, T0)).allowed).toBe(true);
  });

  it("blocks once the limit is reached", async () => {
    await failTimes(LOGIN_MAX_ATTEMPTS_PER_EMAIL);
    const verdict = await checkLoginAllowed(db, identity, T0);
    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("reports a retry time the client can actually wait out", async () => {
    await failTimes(LOGIN_MAX_ATTEMPTS_PER_EMAIL);
    const verdict = await checkLoginAllowed(db, identity, T0);
    expect(verdict.retryAfterSeconds).toBeLessThanOrEqual(LOGIN_WINDOW_MS / 1000);
  });

  it("lets the window expire", async () => {
    await failTimes(LOGIN_MAX_ATTEMPTS_PER_EMAIL);
    const later = T0 + LOGIN_WINDOW_MS + 1;
    expect((await checkLoginAllowed(db, identity, later)).allowed).toBe(true);
  });

  it("starts a fresh count after expiry rather than resuming the old one", async () => {
    await failTimes(LOGIN_MAX_ATTEMPTS_PER_EMAIL);
    const later = T0 + LOGIN_WINDOW_MS + 1;
    await recordLoginFailure(db, identity, later);
    // One failure in the new window, not limit+1 — otherwise a user who was
    // locked out once would be locked out permanently.
    expect((await checkLoginAllowed(db, identity, later)).allowed).toBe(true);
  });

  it("clears on a successful sign-in", async () => {
    await failTimes(LOGIN_MAX_ATTEMPTS_PER_EMAIL);
    await clearLoginFailures(db, identity.email);
    expect((await checkLoginAllowed(db, identity, T0)).allowed).toBe(true);
  });

  it("does not let one account's failures lock out another", async () => {
    await failTimes(LOGIN_MAX_ATTEMPTS_PER_EMAIL);
    const other = { email: "other@example.com", ip: "198.51.100.4" };
    expect((await checkLoginAllowed(db, other, T0)).allowed).toBe(true);
  });
});

describe("per-IP throttling", () => {
  it("catches password spraying across many accounts", async () => {
    // The per-email counter never sees this attack: no single account
    // accumulates enough failures to trip it.
    const ip = "203.0.113.99";
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS_PER_IP; i += 1) {
      await recordLoginFailure(db, { email: `victim${i}@example.com`, ip }, T0);
    }
    const next = await checkLoginAllowed(db, { email: "victim999@example.com", ip }, T0);
    expect(next.allowed).toBe(false);
  });

  it("survives a successful sign-in", async () => {
    // An attacker spraying from one address will eventually guess right;
    // resetting their IP allowance at that moment rewards the one attempt we
    // most wanted to slow down.
    const ip = "203.0.113.42";
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS_PER_IP; i += 1) {
      await recordLoginFailure(db, { email: `v${i}@example.com`, ip }, T0);
    }
    await clearLoginFailures(db, "v0@example.com");
    expect((await checkLoginAllowed(db, { email: "v0@example.com", ip }, T0)).allowed).toBe(false);
  });
});

describe("checkLoginAllowed", () => {
  it("does not itself count as an attempt", async () => {
    // If polling incremented, anyone could keep a victim locked out forever by
    // hammering their address — and a locked-out user would extend their own
    // lockout just by retrying the page.
    await failTimes(LOGIN_MAX_ATTEMPTS_PER_EMAIL - 1);
    for (let i = 0; i < 20; i += 1) await checkLoginAllowed(db, identity, T0);
    expect((await checkLoginAllowed(db, identity, T0)).allowed).toBe(true);
  });
});

describe("registration throttling", () => {
  it("allows a burst up to the limit, then blocks", async () => {
    const ip = "192.0.2.10";
    for (let i = 0; i < REGISTER_MAX_PER_IP; i += 1) {
      expect((await checkRegisterAllowed(db, ip, T0)).allowed, `attempt ${i + 1}`).toBe(true);
    }
    expect((await checkRegisterAllowed(db, ip, T0)).allowed).toBe(false);
  });

  it("counts per IP, not globally", async () => {
    for (let i = 0; i < REGISTER_MAX_PER_IP + 2; i += 1) {
      await checkRegisterAllowed(db, "192.0.2.11", T0);
    }
    expect((await checkRegisterAllowed(db, "192.0.2.12", T0)).allowed).toBe(true);
  });
});

describe("housekeeping", () => {
  it("purges expired counters and keeps live ones", async () => {
    await failTimes(2, T0);
    await failTimes(2, T0 + LOGIN_WINDOW_MS * 10, { email: "later@example.com", ip: "192.0.2.20" });

    await purgeExpiredThrottles(db, T0 + LOGIN_WINDOW_MS + 1);

    const rows = await db.all<{ key: string }>("SELECT key FROM auth_throttle");
    expect(rows.some((r) => r.key.includes("player@example.com"))).toBe(false);
    expect(rows.some((r) => r.key.includes("later@example.com"))).toBe(true);
  });
});
