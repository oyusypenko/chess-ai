import type { UserRecord } from "@/db/repositories";

/**
 * Entitlement service (US-F3) — the single source of truth for plan state.
 *
 * Every gated endpoint asks this module, never the client. US-F3 is explicit
 * that client checks are cosmetic, so the shape here is deliberately one a
 * client cannot forge: it takes a `UserRecord` read from our database.
 *
 * **Checkout is not implemented.** The provider is open question O-5 (Paddle vs
 * Stripe), and a half-integrated payment provider is worse than none — it
 * invites someone to ship a flow whose webhooks nobody has verified. What is
 * implemented is everything the rest of the product needs to be correct once a
 * provider is chosen: plan resolution, grace periods, and quotas.
 */

export type Plan = "free" | "paid";

export type Entitlements = {
  readonly plan: Plan;
  /** AI-narrated reports per day. Engine-only analysis is never metered. */
  readonly reportsPerDay: number;
  readonly dashboardAccess: boolean;
  readonly recommendationHistory: boolean;
  /** True while a lapsed subscription is inside its grace period (US-F2). */
  readonly inGracePeriod: boolean;
};

/** US-F1: free tier is 3 AI-narrated reports per day. */
export const FREE_REPORTS_PER_DAY = 3;

/** Effectively unlimited; a number rather than Infinity so it can be logged. */
export const PAID_REPORTS_PER_DAY = 1000;

/** US-F2: failed payment gets 7 days before the plan downgrades. */
export const GRACE_PERIOD_DAYS = 7;

export function resolveEntitlements(user: UserRecord, now: Date = new Date()): Entitlements {
  const paidUntil = user.plan_until ? new Date(user.plan_until) : null;
  const graceEnds = paidUntil
    ? new Date(paidUntil.getTime() + GRACE_PERIOD_DAYS * 86_400_000)
    : null;

  const activePaid = user.plan === "paid" && (paidUntil === null || paidUntil > now);
  const inGracePeriod =
    user.plan === "paid" &&
    paidUntil !== null &&
    paidUntil <= now &&
    graceEnds !== null &&
    graceEnds > now;

  // Grace keeps full access: a card that expired over a weekend should not cost
  // someone the dashboard they are paying for (US-F2).
  const effectivePaid = activePaid || inGracePeriod;

  return {
    plan: effectivePaid ? "paid" : "free",
    reportsPerDay: effectivePaid ? PAID_REPORTS_PER_DAY : FREE_REPORTS_PER_DAY,
    dashboardAccess: true, // P1 keeps the dashboard open; gating is a pricing decision (O-7)
    recommendationHistory: effectivePaid,
    inGracePeriod,
  };
}

/**
 * Checkout — deliberately unimplemented.
 *
 * Throwing rather than returning a stub URL: a silent no-op here would surface
 * as a broken payment flow in production, which is the worst place to discover
 * that O-5 was never answered.
 */
export class CheckoutNotConfiguredError extends Error {
  constructor() {
    super(
      "Checkout is not configured. Billing provider is open question O-5 (Paddle vs Stripe) — see docs/decisions.md.",
    );
    this.name = "CheckoutNotConfiguredError";
  }
}
