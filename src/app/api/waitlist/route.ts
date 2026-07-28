import { NextResponse } from "next/server";
import { captureEmail, MemoryEmailStore } from "@/server/email-capture";
import { checkRateLimit, clientIdentifier, MemoryRateLimitStore } from "@/server/rate-limit";
import { track } from "@/server/telemetry";

/**
 * `POST /api/waitlist` — waitlist signup with GDPR consent (US-A1, NFR-PR2).
 *
 * Rate-limited on its own scope so signup abuse cannot consume the report
 * allowance, and vice versa.
 *
 * The address never enters telemetry (FR-6) — the funnel event records only
 * that a capture happened.
 */

// Replaced by durable storage at P1, subject to the O-8 residency answer.
const emailStore = new MemoryEmailStore();
const rateLimitStore = new MemoryRateLimitStore();

export async function POST(request: Request): Promise<NextResponse> {
  const limit = await checkRateLimit(rateLimitStore, clientIdentifier(request), {
    scope: "waitlist",
    limit: 10,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, message: "Too many attempts. Please try again tomorrow." },
      { status: 429 },
    );
  }

  let body: { email?: string; consent?: boolean; source?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: "Malformed request." }, { status: 400 });
  }

  const result = await captureEmail(emailStore, {
    email: String(body?.email ?? ""),
    // Strict comparison: only a literal `true` is consent. A checkbox that
    // serializes to "on" is not an affirmative record of agreement.
    consent: body?.consent === true,
    source: typeof body?.source === "string" ? body.source : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: result.reason, message: result.message },
      { status: 400 },
    );
  }

  // No address in the event (FR-6).
  track("email_captured", { source: result.record.source });

  return NextResponse.json({ ok: true });
}
