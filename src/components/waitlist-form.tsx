"use client";

import { useState } from "react";

/**
 * Waitlist capture with GDPR consent (US-A1, NFR-PR2).
 *
 * The consent checkbox is **unticked by default and required**. A pre-ticked
 * box is not consent under the GDPR, and neither is submitting the form — the
 * user has to take an affirmative action, so the submit button stays disabled
 * until they do.
 */
export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent, source: "demo" }),
      });
      const data = (await response.json()) as { ok: boolean; message?: string };
      if (data.ok) {
        setState("done");
      } else {
        setState("error");
        setMessage(data.message ?? "Something went wrong.");
      }
    } catch {
      setState("error");
      setMessage("We couldn't reach the server. Please try again.");
    }
  }

  if (state === "done") {
    return (
      <p className="text-sm text-black/70 dark:text-white/70" role="status">
        Thanks — we&rsquo;ll email you when the full weakness dashboard launches.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Get your full weakness report at launch</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        />
      </label>

      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-black/70 dark:text-white/70">
          I agree to receive an email when ChessCoach AI launches. You can unsubscribe at any time.
          See our{" "}
          <a className="underline" href="/privacy">
            privacy policy
          </a>
          .
        </span>
      </label>

      <button
        type="submit"
        // Disabled until consent is actively given — the button state is the
        // affirmative-action requirement made visible.
        disabled={!consent || state === "sending"}
        className="w-fit rounded-md border border-black/15 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-white/20"
      >
        {state === "sending" ? "Signing up…" : "Notify me"}
      </button>

      {state === "error" ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {message}
        </p>
      ) : null}
    </form>
  );
}
