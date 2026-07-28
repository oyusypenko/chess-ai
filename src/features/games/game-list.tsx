"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

/**
 * Game history (US-B1, US-B3).
 *
 * **Initial data comes from the server** and later loads are driven by user
 * actions, not by an effect. Fetching in `useEffect` would add a client
 * round-trip after the page had already rendered — a waterfall on a page that
 * is server-rendered anyway — and React 19 flags the set-state-in-effect
 * pattern for exactly this reason.
 *
 * Mobile-first (D-08): each game is a card at 360 px, because a seven-column
 * table is unreadable at that width however it scrolls.
 */

export type GameListItem = {
  id: string;
  platform_game_id: string;
  played_at: string;
  speed: string;
  time_control: string;
  rated: number;
  subject_color: "white" | "black";
  subject_result: "win" | "loss" | "draw";
  opponent_name: string | null;
  opponent_rating: number | null;
  subject_rating: number | null;
  eco: string | null;
  opening_name: string | null;
  move_count: number;
  analyzed: boolean;
};

const SPEEDS = ["", "bullet", "blitz", "rapid", "classical", "correspondence"] as const;
const RESULTS = ["", "win", "loss", "draw"] as const;
const COLORS = ["", "white", "black"] as const;

const RESULT_TONE: Record<string, string> = {
  win: "text-emerald-700 dark:text-emerald-400",
  loss: "text-red-700 dark:text-red-400",
  draw: "text-black/60 dark:text-white/60",
};

export function GameList({ initialGames }: { initialGames: GameListItem[] }) {
  const [games, setGames] = useState(initialGames);
  const [filters, setFilters] = useState({ speed: "", result: "", color: "" });
  const [pending, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function fetchGames(next: typeof filters) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);

    const response = await fetch(`/api/games?${params}`);
    if (response.status === 401) {
      window.location.href = "/login?redirect_to=/games";
      return;
    }
    const data = (await response.json()) as { ok: boolean; games?: GameListItem[] };
    setGames(data.games ?? []);
  }

  function applyFilter(key: keyof typeof filters, value: string) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    startTransition(async () => {
      await fetchGames(next);
    });
  }

  async function sync() {
    setSyncing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/games/sync", { method: "POST" });
      const data = (await response.json()) as { ok: boolean; imported?: number; message?: string };
      setMessage(
        data.ok
          ? `Imported ${data.imported} game${data.imported === 1 ? "" : "s"}.`
          : (data.message ?? "Sync failed."),
      );
      if (data.ok) await fetchGames(filters);
    } catch {
      setMessage("We couldn't reach the server. Please try again.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={sync}
          disabled={syncing}
          className="rounded-md border border-black/20 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-white/25"
        >
          {syncing ? "Syncing…" : "Sync recent games"}
        </button>
        {message ? (
          <span className="text-xs text-black/60 dark:text-white/60" role="status">
            {message}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Filter
          label="Time control"
          value={filters.speed}
          onChange={(v) => applyFilter("speed", v)}
          options={SPEEDS}
        />
        <Filter
          label="Result"
          value={filters.result}
          onChange={(v) => applyFilter("result", v)}
          options={RESULTS}
        />
        <Filter
          label="Colour"
          value={filters.color}
          onChange={(v) => applyFilter("color", v)}
          options={COLORS}
        />
      </div>

      {games.length === 0 ? (
        <p className="rounded-lg border border-black/10 p-4 text-sm text-black/70 dark:border-white/15 dark:text-white/70">
          {filters.speed || filters.result || filters.color
            ? "No games match those filters."
            : "No games yet. Hit Sync recent games to pull your latest finished games from Lichess."}
        </p>
      ) : (
        <ul
          className={`flex flex-col gap-2 ${pending ? "opacity-60" : ""}`}
          data-testid="game-list"
        >
          {games.map((game) => (
            <li key={game.id}>
              <Link
                href={`/games/${encodeURIComponent(game.id)}`}
                className="flex flex-col gap-1 rounded-lg border border-black/10 p-3 hover:bg-black/[0.03] dark:border-white/15 dark:hover:bg-white/[0.04]"
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className={`font-medium ${RESULT_TONE[game.subject_result]}`}>
                    {game.subject_result === "win"
                      ? "Win"
                      : game.subject_result === "loss"
                        ? "Loss"
                        : "Draw"}
                  </span>
                  <span className="text-black/70 dark:text-white/70">
                    vs {game.opponent_name ?? "unknown"}
                    {game.opponent_rating ? ` (${game.opponent_rating})` : ""}
                  </span>
                  {game.analyzed ? (
                    <span className="rounded bg-emerald-600/15 px-1.5 py-0.5 text-[0.6875rem] font-medium text-emerald-800 dark:text-emerald-300">
                      Analysed
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-wrap gap-x-2 text-xs text-black/55 dark:text-white/55">
                  <span>{new Date(game.played_at).toLocaleDateString()}</span>
                  <span>·</span>
                  <span>
                    {game.speed} {game.time_control}
                  </span>
                  <span>·</span>
                  <span>as {game.subject_color}</span>
                  {game.opening_name ? (
                    <>
                      <span>·</span>
                      <span className="truncate">
                        {game.eco} {game.opening_name}
                      </span>
                    </>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-black/60 dark:text-white/60">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/20 dark:bg-transparent"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option === "" ? "All" : option}
          </option>
        ))}
      </select>
    </label>
  );
}
