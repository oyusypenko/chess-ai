import { describe, it, expect } from "vitest";
import {
  resolveEntitlements,
  FREE_REPORTS_PER_DAY,
  GRACE_PERIOD_DAYS,
  CheckoutNotConfiguredError,
} from "./entitlements";
import type { UserRecord } from "@/db/repositories";

function user(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "u1",
    lichess_id: "player",
    lichess_name: "Player",
    created_at: "2026-01-01T00:00:00.000Z",
    last_seen_at: "2026-03-01T00:00:00.000Z",
    plan: "free",
    plan_until: null,
    deletion_requested_at: null,
    ...overrides,
  };
}

const NOW = new Date("2026-03-15T12:00:00.000Z");
const iso = (daysFromNow: number) =>
  new Date(NOW.getTime() + daysFromNow * 86_400_000).toISOString();

describe("resolveEntitlements (US-F1, US-F3)", () => {
  it("gives free users the documented daily allowance", () => {
    const result = resolveEntitlements(user(), NOW);
    expect(result.plan).toBe("free");
    expect(result.reportsPerDay).toBe(FREE_REPORTS_PER_DAY);
  });

  it("gives paid users a much higher allowance", () => {
    const result = resolveEntitlements(user({ plan: "paid", plan_until: iso(30) }), NOW);
    expect(result.plan).toBe("paid");
    expect(result.reportsPerDay).toBeGreaterThan(FREE_REPORTS_PER_DAY);
    expect(result.recommendationHistory).toBe(true);
  });

  it("treats a paid plan with no end date as active", () => {
    expect(resolveEntitlements(user({ plan: "paid", plan_until: null }), NOW).plan).toBe("paid");
  });
});

describe("grace period (US-F2)", () => {
  it("keeps full access immediately after expiry", () => {
    // A card that expired over a weekend must not cost someone the dashboard
    // they are paying for.
    const result = resolveEntitlements(user({ plan: "paid", plan_until: iso(-1) }), NOW);
    expect(result.plan).toBe("paid");
    expect(result.inGracePeriod).toBe(true);
  });

  it("keeps access on the last day of grace", () => {
    const result = resolveEntitlements(
      user({ plan: "paid", plan_until: iso(-(GRACE_PERIOD_DAYS - 1)) }),
      NOW,
    );
    expect(result.plan).toBe("paid");
    expect(result.inGracePeriod).toBe(true);
  });

  it("downgrades once grace has run out", () => {
    const result = resolveEntitlements(
      user({ plan: "paid", plan_until: iso(-(GRACE_PERIOD_DAYS + 1)) }),
      NOW,
    );
    expect(result.plan).toBe("free");
    expect(result.inGracePeriod).toBe(false);
    expect(result.reportsPerDay).toBe(FREE_REPORTS_PER_DAY);
  });

  it("never puts a free user in a grace period", () => {
    expect(
      resolveEntitlements(user({ plan: "free", plan_until: iso(-1) }), NOW).inGracePeriod,
    ).toBe(false);
  });
});

describe("checkout", () => {
  it("is explicitly unimplemented rather than silently stubbed", () => {
    // A stub that returns a URL would surface as a broken payment flow in
    // production — the worst place to learn O-5 was never answered.
    const error = new CheckoutNotConfiguredError();
    expect(error.message).toMatch(/O-5/);
    expect(error.message).toMatch(/Paddle|Stripe/);
  });
});
