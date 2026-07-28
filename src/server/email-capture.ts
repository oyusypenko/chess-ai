/**
 * Waitlist email capture (US-A1, NFR-PR2, NFR-PR3).
 *
 * GDPR shapes this more than the feature does:
 *   - **Consent must be explicit and recorded.** A submitted form is not
 *     consent; a ticked box the user actively set is. We store the consent flag
 *     and the timestamp alongside the address, because "did they agree, and
 *     when?" is the question a regulator asks.
 *   - The address is personal data (NFR-PR1). It never enters telemetry (FR-6),
 *     never reaches the LLM, and is deletable (US-A4/NFR-PR3).
 */

export type EmailCaptureInput = {
  readonly email: string;
  /** Must be `true`. A missing or false value is a refusal, not a default. */
  readonly consent: boolean;
  readonly source?: string;
};

export type EmailRecord = {
  readonly email: string;
  readonly consentedAt: string;
  readonly source: string;
};

export type CaptureResult =
  | { readonly ok: true; readonly record: EmailRecord }
  | {
      readonly ok: false;
      readonly reason: "invalid_email" | "consent_required";
      readonly message: string;
    };

export interface EmailStore {
  save(record: EmailRecord): Promise<void>;
}

/**
 * Pragmatic validation.
 *
 * Deliberately not an RFC-5322 regex: those are unreadable, and the only real
 * proof an address works is sending to it. This rejects the obviously wrong
 * and lets the confirmation email do the rest.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const MAX_EMAIL_LENGTH = 254; // RFC 5321 practical maximum

export function isValidEmail(email: string): boolean {
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);
}

export async function captureEmail(
  store: EmailStore,
  input: EmailCaptureInput,
  now: Date = new Date(),
): Promise<CaptureResult> {
  const email = input.email.trim().toLowerCase();

  if (!isValidEmail(email)) {
    return {
      ok: false,
      reason: "invalid_email",
      message: "That doesn't look like a valid email address.",
    };
  }

  // Explicit and unambiguous: only a literal `true` counts.
  if (input.consent !== true) {
    return {
      ok: false,
      reason: "consent_required",
      message: "Please tick the box to confirm you're happy for us to email you.",
    };
  }

  const record: EmailRecord = {
    email,
    consentedAt: now.toISOString(),
    source: input.source ?? "demo",
  };

  await store.save(record);
  return { ok: true, record };
}

/** In-memory store for development and tests. Real storage lands with P1. */
export class MemoryEmailStore implements EmailStore {
  readonly records: EmailRecord[] = [];
  async save(record: EmailRecord): Promise<void> {
    // Idempotent on address: re-submitting refreshes consent rather than
    // creating a duplicate the deletion path would then have to find twice.
    const existing = this.records.findIndex((r) => r.email === record.email);
    if (existing >= 0) this.records[existing] = record;
    else this.records.push(record);
  }
}
