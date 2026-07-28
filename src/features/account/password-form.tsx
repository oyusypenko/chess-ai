"use client";

import { useState } from "react";
import { PASSWORD_MIN_LENGTH } from "@/auth/policy";

/**
 * Set or change the account password (US-A2).
 *
 * `hasPassword` decides which of the two this is. An OAuth-only account has
 * nothing to verify — the live session already proves control — so asking for a
 * "current password" it does not have would be an unanswerable question.
 */
export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setResult(null);

    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      const data = (await response.json()) as { ok: boolean; message?: string };

      setResult({
        ok: data.ok,
        message: data.message ?? (data.ok ? "Password updated." : "Something went wrong."),
      });
      if (data.ok) {
        // Never leave a password sitting in component state after it is no
        // longer needed.
        setCurrent("");
        setNext("");
      }
    } catch {
      setResult({ ok: false, message: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {hasPassword ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Current password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="rounded-md border border-black/15 px-3 py-2 text-base dark:border-white/20 dark:bg-transparent"
          />
        </label>
      ) : null}

      {/*
        Hint outside the label, described-by rather than labelled-by: nested, its
        text would become part of the field's accessible name.
      */}
      <div className="flex flex-col gap-1 text-sm">
        <label className="font-medium" htmlFor="new-password">
          {hasPassword ? "New password" : "Password"}
        </label>
        <input
          id="new-password"
          type="password"
          required
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          aria-describedby="new-password-hint"
          className="rounded-md border border-black/15 px-3 py-2 text-base dark:border-white/20 dark:bg-transparent"
        />
        <span id="new-password-hint" className="text-xs text-black/55 dark:text-white/55">
          At least {PASSWORD_MIN_LENGTH} characters. Changing it signs out your other devices.
        </span>
      </div>

      {result ? (
        <p
          className={`rounded-md border p-2 text-sm ${
            result.ok ? "border-black/10 dark:border-white/15" : "border-red-500/40 bg-red-500/10"
          }`}
          role={result.ok ? "status" : "alert"}
        >
          {result.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="w-fit rounded-md border border-black/15 px-4 py-2 text-sm font-medium disabled:opacity-60 dark:border-white/20"
      >
        {busy ? "Saving…" : hasPassword ? "Change password" : "Set password"}
      </button>
    </form>
  );
}
