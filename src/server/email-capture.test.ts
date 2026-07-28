import { describe, it, expect } from "vitest";
import { captureEmail, isValidEmail, MemoryEmailStore } from "./email-capture";
import { scrub, MemoryTelemetrySink, track, setTelemetrySink } from "./telemetry";

describe("isValidEmail", () => {
  it.each(["a@b.co", "first.last@example.com", "user+tag@sub.example.org"])("accepts %s", (e) => {
    expect(isValidEmail(e)).toBe(true);
  });

  it.each(["", "no-at-sign", "@example.com", "user@", "user@host", "a b@example.com"])(
    "rejects %s",
    (e) => {
      expect(isValidEmail(e)).toBe(false);
    },
  );

  it("rejects an address beyond the practical maximum length", () => {
    expect(isValidEmail(`${"a".repeat(250)}@example.com`)).toBe(false);
  });
});

describe("captureEmail — GDPR consent (NFR-PR2)", () => {
  it("stores the address with an explicit consent timestamp", async () => {
    const store = new MemoryEmailStore();
    const result = await captureEmail(
      store,
      { email: "Player@Example.com", consent: true },
      new Date("2026-03-01T12:00:00Z"),
    );

    expect(result.ok).toBe(true);
    expect(store.records[0]).toEqual({
      email: "player@example.com", // normalized
      consentedAt: "2026-03-01T12:00:00.000Z",
      source: "demo",
    });
  });

  it("REFUSES to store without consent — submitting a form is not consent", async () => {
    const store = new MemoryEmailStore();
    const result = await captureEmail(store, { email: "a@b.co", consent: false });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: "consent_required" });
    expect(store.records).toHaveLength(0);
  });

  it("treats a missing consent flag as refusal, not as a default", async () => {
    const store = new MemoryEmailStore();
    const result = await captureEmail(store, {
      email: "a@b.co",
      consent: undefined as unknown as boolean,
    });
    expect(result.ok).toBe(false);
    expect(store.records).toHaveLength(0);
  });

  it("treats a truthy non-true value as refusal", async () => {
    const store = new MemoryEmailStore();
    // "on" is what an unchecked-but-present HTML checkbox can serialize to.
    const result = await captureEmail(store, {
      email: "a@b.co",
      consent: "on" as unknown as boolean,
    });
    expect(result.ok).toBe(false);
  });

  it("does not store an invalid address even with consent", async () => {
    const store = new MemoryEmailStore();
    const result = await captureEmail(store, { email: "nope", consent: true });
    expect(result).toMatchObject({ ok: false, reason: "invalid_email" });
    expect(store.records).toHaveLength(0);
  });

  it("is idempotent per address so deletion has one record to find", async () => {
    const store = new MemoryEmailStore();
    await captureEmail(store, { email: "a@b.co", consent: true });
    await captureEmail(store, { email: "A@B.CO", consent: true });
    expect(store.records).toHaveLength(1);
  });
});

describe("telemetry (FR-6) — no identities", () => {
  it("strips personal fields even if a caller passes them", () => {
    // The backstop behind "events carry no identities": someone adds a
    // property later without thinking, and this is where it gets caught.
    const cleaned = scrub({
      email: "a@b.co",
      username: "player",
      ip: "1.2.3.4",
      moveCount: 42,
      degraded: true,
    });
    expect(cleaned).toEqual({ moveCount: 42, degraded: true });
  });

  it("is case-insensitive about forbidden keys", () => {
    expect(scrub({ Email: "a@b.co", USERNAME: "x", ok: true })).toEqual({ ok: true });
  });

  it("records funnel events", () => {
    const sink = new MemoryTelemetrySink();
    setTelemetrySink(sink);
    track("username_submitted");
    track("report_viewed", { moveCount: 30 });
    expect(sink.events.map((e) => e.event)).toEqual(["username_submitted", "report_viewed"]);
    expect(sink.events[1].properties).toEqual({ moveCount: 30 });
  });

  it("never throws out of track(), even if the sink fails", () => {
    setTelemetrySink({
      record() {
        throw new Error("analytics down");
      },
    });
    // A dropped metric is an inconvenience; a 500 because analytics failed is
    // a bug.
    expect(() => track("report_viewed")).not.toThrow();
    setTelemetrySink(new MemoryTelemetrySink());
  });
});
