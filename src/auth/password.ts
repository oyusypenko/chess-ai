/**
 * Password hashing and policy (US-A2, NFR-S1).
 *
 * ## Why PBKDF2 and not bcrypt/argon2
 *
 * We deploy to Cloudflare Workers. There is no native module loader there, so
 * bcrypt and argon2 are simply unavailable, and the pure-JS ports are both slow
 * *and* slow in the wrong way — they burn our CPU budget without the memory
 * hardness that makes argon2 worth having. PBKDF2 via `crypto.subtle` is
 * implemented natively by the runtime, so it is the strongest option that
 * actually runs where this code runs.
 *
 * ## Why the parameters live inside the hash
 *
 * Stored form: `pbkdf2-sha256$<iterations>$<salt-b64>$<derived-b64>`.
 *
 * The cost parameter is part of the record, not a constant in this file. That
 * is what makes it raisable: bump `PBKDF2_ITERATIONS`, and existing users keep
 * verifying against the count they were hashed with while new and re-entered
 * passwords get the new one. A bare `hash` column with the cost hard-coded here
 * would make every future increase a flag-day migration nobody performs.
 *
 * ## On the iteration count
 *
 * 600,000 is OWASP's current floor for PBKDF2-HMAC-SHA-256, and we use it.
 *
 * The obvious objection is the Workers CPU budget, so it was measured rather
 * than guessed (Node 22, Apple Silicon): 100k → 19 ms, 210k → 25 ms, 600k →
 * 72 ms per hash. The free tier's 10 ms CPU limit is exceeded by *every* one of
 * those, including counts far too weak to be worth having — so that limit does
 * not discriminate between the options and is no argument for a lower number.
 * Against the paid tier's budget, 72 ms is affordable on a route users hit once
 * a month. Picking 210k would have bought nothing real and cost a third of the
 * work factor.
 *
 * Hashing is not the only defence: throttling per identifier and per IP
 * (`src/server/auth-throttle.ts`) is what bounds an *online* attack, and the
 * 128-bit per-record salt is what stops a stolen table being attacked in bulk.
 * The iteration count is what buys time after a dump.
 */

import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "./policy";

export { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH };

const ALGORITHM = "pbkdf2-sha256";
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const DERIVED_BYTES = 32;

/**
 * A very short deny-list. This is not a substitute for a breach corpus (that
 * belongs behind an API like Pwned Passwords, which is a launch follow-up); it
 * catches the specific strings that a length rule alone would let through.
 */
const OBVIOUS_PASSWORDS = new Set([
  "password12",
  "password123",
  "password1234",
  "1234567890",
  "12345678901",
  "123456789012",
  "qwertyuiop",
  "qwerty12345",
  "letmein123",
  "iloveyou12",
  "chesscoach",
  "chesscoachai",
  "stockfish1",
]);

export type PasswordProblem = { ok: false; message: string };
export type PasswordOk = { ok: true };

/**
 * Policy check, returning a message written for the person typing it.
 *
 * `email` is passed in so we can reject a password that is just the address —
 * the single most predictable choice, and one no length rule catches.
 */
export function validatePassword(password: string, email?: string): PasswordOk | PasswordProblem {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      message: `Use at least ${PASSWORD_MIN_LENGTH} characters. A short phrase you'll remember beats a short scramble you won't.`,
    };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, message: `Passwords are limited to ${PASSWORD_MAX_LENGTH} characters.` };
  }
  if (OBVIOUS_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, message: "That password is one of the first an attacker would try." };
  }
  if (email) {
    const normalized = normalizeEmail(email);
    const localPart = normalized.split("@")[0] ?? "";
    const lower = password.toLowerCase();
    if (lower === normalized || (localPart.length >= 4 && lower === localPart)) {
      return { ok: false, message: "Your password can't be your email address." };
    }
  }
  return { ok: true };
}

/** Lowercase and trim. Storage and lookup both go through this, or they drift. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Deliberately permissive.
 *
 * The only authority on whether an address works is whether mail reaches it.
 * An over-clever regex here rejects real, valid addresses (plus-tags, new TLDs,
 * unicode locals) and buys nothing — so this checks the shape and stops.
 */
export function isPlausibleEmail(email: string): boolean {
  const value = normalizeEmail(email);
  if (value.length < 3 || value.length > 254) return false;
  if (/\s/.test(value)) return false;
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return false;
  const domain = value.slice(at + 1);
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(SALT_BYTES)));
  const derived = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `${ALGORITHM}$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(derived)}`;
}

/**
 * Verify, returning whether the hash should be upgraded.
 *
 * `needsRehash` is how the iteration count actually moves: a correct sign-in is
 * the one moment we hold the plaintext, so it is the only chance to re-hash at
 * the current cost. Callers persist the new hash on true.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  const parsed = parseHash(stored);
  if (!parsed) return { valid: false, needsRehash: false };

  const derived = await deriveBits(password, parsed.salt, parsed.iterations);
  const valid = timingSafeEqual(derived, parsed.derived);
  return { valid, needsRehash: valid && parsed.iterations < PBKDF2_ITERATIONS };
}

/**
 * Burn roughly the same CPU as a real verification, then fail.
 *
 * Called when no account exists for the submitted address. Without it, "no such
 * user" returns in microseconds while a real user's wrong password takes the
 * full PBKDF2 cost, and that difference is a reliable account-enumeration
 * oracle no matter how carefully the two responses are worded.
 */
export async function fakeVerify(password: string): Promise<void> {
  const salt = new Uint8Array(new ArrayBuffer(SALT_BYTES));
  await deriveBits(password, salt, PBKDF2_ITERATIONS);
}

async function deriveBits(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    // NFC-normalize so a password typed with a composed accent matches one
    // typed with a combining accent — the bytes differ, the password does not.
    new TextEncoder().encode(password.normalize("NFC")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as unknown as BufferSource, iterations },
    key,
    DERIVED_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function parseHash(
  stored: string,
): { iterations: number; salt: Uint8Array; derived: Uint8Array } | null {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== ALGORITHM) return null;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1) return null;
  try {
    return { iterations, salt: fromBase64(parts[2]), derived: fromBase64(parts[3]) };
  } catch {
    return null;
  }
}

/**
 * Constant-time comparison.
 *
 * `===` on the base64 strings would return as soon as two bytes differ, leaking
 * how far the match got. Everything here runs over the full length regardless.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
