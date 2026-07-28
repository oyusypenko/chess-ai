"use client";

import { useState } from "react";
import { PASSWORD_MIN_LENGTH } from "@/auth/policy";

/**
 * Email + password form, shared by sign-in and registration (US-A2).
 *
 * One component for both modes because the two forms differ only in the
 * endpoint, the button label, and whether the browser should offer to save a
 * new password. Duplicating them is how the sign-in form ends up missing the
 * autocomplete hints that make a password manager work.
 *
 * Mobile-first (D-08): full-width stacked fields, 16 px inputs so iOS Safari
 * does not zoom the viewport on focus.
 */

type Mode = "signin" | "register";

type Response = { ok: boolean; message?: string; field?: string; redirect_to?: string };

export function CredentialsForm({ mode, redirectTo }: { mode: Mode; redirectTo: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);

  const isRegister = mode === "register";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(isRegister ? "/api/auth/register" : "/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, redirect_to: redirectTo }),
      });
      const data = (await response.json()) as Response;

      if (!data.ok) {
        setError({ message: data.message ?? "Something went wrong.", field: data.field });
        setBusy(false);
        return;
      }

      // A full navigation, not a router push: the session cookie was just set,
      // and every server component on the destination has to re-render with the
      // signed-in state. A client-side transition would leave the cached
      // anonymous header in place.
      window.location.assign(data.redirect_to ?? redirectTo);
    } catch {
      setError({ message: "We couldn't reach the server. Please try again." });
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Email</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          // Off for both: an email address is not a sentence.
          autoCapitalize="off"
          autoCorrect="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error?.field === "email" || undefined}
          placeholder="you@example.com"
          className="rounded-md border border-black/15 px-3 py-2 text-base dark:border-white/20 dark:bg-transparent"
        />
      </label>

      {/*
        The hint is a sibling of the label, not a child of it.
        Nested inside, its text joins the input's accessible name — the field
        stops being called "Password" and starts being called "Password At least
        10 characters…", which breaks screen-reader announcements and any
        by-label lookup. `aria-describedby` is the correct relationship for a
        hint: announced after the name, not as part of it.
      */}
      <div className="flex flex-col gap-1 text-sm">
        <label className="font-medium" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          name="password"
          required
          // The distinction matters to password managers: `new-password` is what
          // prompts them to generate and offer to save one.
          autoComplete={isRegister ? "new-password" : "current-password"}
          minLength={isRegister ? PASSWORD_MIN_LENGTH : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error?.field === "password" || undefined}
          aria-describedby={isRegister ? "password-hint" : undefined}
          className="rounded-md border border-black/15 px-3 py-2 text-base dark:border-white/20 dark:bg-transparent"
        />
        {isRegister ? (
          <span id="password-hint" className="text-xs text-black/55 dark:text-white/55">
            At least {PASSWORD_MIN_LENGTH} characters. A phrase you&rsquo;ll remember beats a
            scramble you won&rsquo;t.
          </span>
        ) : null}
      </div>

      {error ? (
        <p
          className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-sm"
          role="alert"
          data-testid="credentials-error"
        >
          {error.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="rounded-md border border-black/20 bg-black px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 dark:border-white/25 dark:bg-white dark:text-black"
      >
        {busy
          ? isRegister
            ? "Creating account…"
            : "Signing in…"
          : isRegister
            ? "Create account"
            : "Sign in"}
      </button>
    </form>
  );
}
