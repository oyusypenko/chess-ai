"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Active sessions, with revocation (US-A4, NFR-S1).
 *
 * This is the user-facing half of server-side sessions. Because a session is a
 * database row rather than a signed token, "sign out that device" is a DELETE
 * that takes effect on the device's very next request — not a wait for an
 * expiry to elapse.
 *
 * Initial data is server-rendered and passed in; revocation re-fetches through
 * `router.refresh()`. Fetching the list in an effect instead would add a client
 * waterfall to a page that already had the data at render time.
 */

export type SessionSummary = {
  id: string;
  created_at: string;
  last_used_at: string | null;
  auth_method: "lichess" | "password";
  user_agent: string | null;
  current: boolean;
};

export function SessionList({ sessions }: { sessions: SessionSummary[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function revoke(body: Record<string, unknown>, id: string) {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch("/api/account/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { ok: boolean; message?: string };
      if (!data.ok) {
        setError(data.message ?? "Couldn't revoke that session.");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("We couldn't reach the server. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  const others = sessions.filter((s) => !s.current);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-black/10 p-3 text-sm dark:border-white/15"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">
                {describeDevice(session.user_agent)}
                {session.current ? (
                  <span className="ml-2 rounded border border-black/15 px-1.5 py-0.5 text-xs font-normal dark:border-white/20">
                    This device
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-black/55 dark:text-white/55">
                {session.auth_method === "password" ? "Email sign-in" : "Lichess sign-in"} · started{" "}
                {formatDate(session.created_at)} · last used {formatDate(session.last_used_at)}
              </span>
            </div>

            {session.current ? null : (
              <button
                type="button"
                onClick={() => revoke({ session_id: session.id }, session.id)}
                disabled={busyId === session.id || pending}
                className="rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium disabled:opacity-60 dark:border-white/20"
              >
                {busyId === session.id ? "Signing out…" : "Sign out"}
              </button>
            )}
          </li>
        ))}
      </ul>

      {error ? (
        <p className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {others.length > 0 ? (
        <button
          type="button"
          onClick={() => revoke({ all_others: true }, "all")}
          disabled={busyId === "all" || pending}
          className="w-fit rounded-md border border-black/15 px-4 py-2 text-sm font-medium disabled:opacity-60 dark:border-white/20"
        >
          {busyId === "all"
            ? "Signing out…"
            : `Sign out ${others.length} other device${others.length === 1 ? "" : "s"}`}
        </button>
      ) : null}
    </div>
  );
}

/**
 * A recognisable label, not a parsed identity.
 *
 * The point is only to help someone answer "is one of these not me?", so a
 * coarse browser + platform guess is enough. UA strings are client-controlled
 * and actively lie, which is exactly why nothing here gates access on the
 * result — it is a label.
 */
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";

  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Browser";

  const platform = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "unknown OS";

  return `${browser} on ${platform}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
