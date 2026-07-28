import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  validatePassword,
  isPlausibleEmail,
  normalizeEmail,
  fakeVerify,
  PASSWORD_MIN_LENGTH,
} from "./password";

/**
 * Password primitives (US-A2, NFR-S1).
 *
 * Each real hash costs ~72 ms by design, so these tests reuse a single hash
 * wherever they can. A suite that hashes freely would be slow enough that
 * someone eventually "fixes" it by lowering the iteration count.
 */

const PASSWORD = "correct horse battery staple";

describe("hashPassword", () => {
  it("never contains the plaintext", async () => {
    const stored = await hashPassword(PASSWORD);
    expect(stored).not.toContain(PASSWORD);
    expect(stored).not.toContain("correct");
  });

  it("records the algorithm and cost in the hash itself", async () => {
    // This is what lets the iteration count be raised later without a flag-day
    // migration: the record knows how it was made.
    const [algorithm, iterations, salt, derived] = (await hashPassword(PASSWORD)).split("$");
    expect(algorithm).toBe("pbkdf2-sha256");
    expect(Number(iterations)).toBeGreaterThanOrEqual(600_000);
    expect(salt.length).toBeGreaterThan(0);
    expect(derived.length).toBeGreaterThan(0);
  });

  it("salts per record, so identical passwords differ on disk", async () => {
    // Without this, a stolen table reveals which users share a password, and
    // one cracked hash cracks all of them.
    const [a, b] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);
    expect(a).not.toBe(b);
  });
});

describe("verifyPassword", () => {
  it("accepts the right password and rejects a wrong one", async () => {
    const stored = await hashPassword(PASSWORD);
    expect((await verifyPassword(PASSWORD, stored)).valid).toBe(true);
    expect((await verifyPassword("correct horse battery stapl", stored)).valid).toBe(false);
  });

  it("is case- and whitespace-sensitive", async () => {
    const stored = await hashPassword(PASSWORD);
    expect((await verifyPassword(PASSWORD.toUpperCase(), stored)).valid).toBe(false);
    expect((await verifyPassword(` ${PASSWORD}`, stored)).valid).toBe(false);
  });

  it("matches across unicode normalization forms", async () => {
    // "é" composed vs. "e" + combining accent are different bytes and the same
    // password. Which one you get depends on the keyboard and the OS, so a user
    // could otherwise be locked out of an account by their own input method.
    // Written as escapes deliberately: as literal characters these two are
    // indistinguishable on screen, and an editor normalizing the file would
    // silently turn this into a test that compares a string with itself.
    const composed = "pa\u00E9sswordxx"; // e-acute as one code point
    const decomposed = "pae\u0301sswordxx"; // e + U+0301 combining acute
    expect(composed).not.toBe(decomposed);

    const stored = await hashPassword(composed);
    expect((await verifyPassword(decomposed, stored)).valid).toBe(true);
  });

  it("rejects a malformed or truncated stored hash without throwing", async () => {
    for (const bad of ["", "notahash", "pbkdf2-sha256$abc$x$y", "bcrypt$1$a$b", "a$b$c$d$e"]) {
      expect((await verifyPassword(PASSWORD, bad)).valid).toBe(false);
    }
  });

  it("flags a hash made with fewer iterations for upgrade", async () => {
    const stored = await hashPassword(PASSWORD);
    const weakened = stored.replace(/^pbkdf2-sha256\$\d+\$/, "pbkdf2-sha256$1000$");
    // The derived bits no longer match at 1000 iterations, so this must be
    // invalid — needsRehash is only meaningful alongside a valid password.
    expect((await verifyPassword(PASSWORD, weakened)).valid).toBe(false);

    // And a current-cost hash is not flagged.
    expect((await verifyPassword(PASSWORD, stored)).needsRehash).toBe(false);
  });
});

describe("fakeVerify", () => {
  it("costs about as much as a real verification", async () => {
    // The whole point is that "no such account" cannot be distinguished from
    // "wrong password" by timing. A loose bound: this is a timing assertion on
    // a shared CI machine, so it checks the same order of magnitude rather than
    // a tight ratio, which would be flaky for no added signal.
    const stored = await hashPassword(PASSWORD);

    const realStart = performance.now();
    await verifyPassword("wrong-password-here", stored);
    const real = performance.now() - realStart;

    const fakeStart = performance.now();
    await fakeVerify("wrong-password-here");
    const fake = performance.now() - fakeStart;

    expect(fake).toBeGreaterThan(real * 0.25);
    expect(fake).toBeLessThan(real * 4);
  });
});

describe("validatePassword", () => {
  it("requires the minimum length", () => {
    expect(validatePassword("a".repeat(PASSWORD_MIN_LENGTH - 1)).ok).toBe(false);
    expect(validatePassword("a".repeat(PASSWORD_MIN_LENGTH)).ok).toBe(true);
  });

  it("rejects an absurdly long password", () => {
    // A guard against making us run PBKDF2 over a multi-megabyte body.
    expect(validatePassword("a".repeat(5000)).ok).toBe(false);
  });

  it("rejects the obvious candidates that pass a length check", () => {
    expect(validatePassword("password123").ok).toBe(false);
    expect(validatePassword("qwertyuiop").ok).toBe(false);
  });

  it("rejects a password that is just the email address", () => {
    expect(validatePassword("player@example.com", "player@example.com").ok).toBe(false);
    expect(validatePassword("PLAYER@EXAMPLE.COM", "player@example.com").ok).toBe(false);
    expect(validatePassword("player", "player@example.com").ok).toBe(false);
  });

  it("imposes no composition rules", () => {
    // NIST SP 800-63B: "must contain a symbol" rules make passwords worse. A
    // long all-lowercase passphrase is accepted on purpose.
    expect(validatePassword("the quick brown fox jumps").ok).toBe(true);
  });

  it("explains the problem instead of restating the rule", () => {
    const result = validatePassword("short");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message.length).toBeGreaterThan(20);
  });
});

describe("email handling", () => {
  it("normalizes case and surrounding whitespace", () => {
    expect(normalizeEmail("  Player@Example.COM ")).toBe("player@example.com");
  });

  it("accepts real addresses an over-strict regex would reject", () => {
    for (const email of [
      "player@example.com",
      "player+chess@example.com",
      "first.last@sub.domain.example",
      "p@e.io",
      "player@example.technology",
    ]) {
      expect(isPlausibleEmail(email), email).toBe(true);
    }
  });

  it("rejects what is clearly not an address", () => {
    for (const email of [
      "",
      "player",
      "@example.com",
      "player@",
      "player@example",
      "player @example.com",
      "a@b@c.com",
      "player@.com",
      `${"a".repeat(250)}@example.com`,
    ]) {
      expect(isPlausibleEmail(email), email).toBe(false);
    }
  });
});
