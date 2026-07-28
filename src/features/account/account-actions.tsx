"use client";

import { useState } from "react";

/**
 * Data export, sign-out, and account deletion (US-A4, NFR-PR3).
 *
 * The delete confirmation asks the user to type their handle. That is not
 * ceremony: deletion is irreversible and cascades across every table they own,
 * so the action needs something only the account holder can supply.
 */
export function AccountActions({ lichessName }: { lichessName: string }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);

  const confirmed = confirm.trim().toLowerCase() === lichessName.toLowerCase();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  async function remove() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const data = (await response.json()) as { ok: boolean; message?: string };
      if (data.ok) {
        window.location.href = "/?deleted=1";
        return;
      }
      setMessage(data.message ?? "Deletion failed.");
    } catch {
      setMessage("We couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <a
          href="/api/account/export?format=json"
          className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/25"
        >
          Download JSON
        </a>
        <a
          href="/api/account/export?format=pgn"
          className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/25"
        >
          Download PGN
        </a>
        <button
          type="button"
          onClick={signOut}
          className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/25"
        >
          Sign out
        </button>
      </div>

      {!showDelete ? (
        <button
          type="button"
          onClick={() => setShowDelete(true)}
          className="w-fit text-sm text-red-700 underline underline-offset-2 dark:text-red-400"
        >
          Delete my account and data
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border border-red-500/40 bg-red-500/5 p-3">
          <p className="text-sm">
            This deletes your account, your imported games, and every report — immediately and
            permanently. Your Lichess account is not affected.
          </p>
          <label className="flex flex-col gap-1 text-xs">
            <span>
              Type <strong>{lichessName}</strong> to confirm
            </span>
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/20 dark:bg-transparent"
              autoComplete="off"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={remove}
              disabled={!confirmed || busy}
              className="rounded-md border border-red-500/50 px-3 py-1.5 text-sm font-medium text-red-700 disabled:opacity-50 dark:text-red-400"
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowDelete(false);
                setConfirm("");
              }}
              className="rounded-md border border-black/20 px-3 py-1.5 text-sm dark:border-white/25"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {message ? (
        <p className="text-sm text-red-700 dark:text-red-400" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
