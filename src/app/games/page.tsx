import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/db";
import { currentUser } from "@/auth/session";
import { listGames } from "@/db/repositories";
import { GameList, type GameListItem } from "@/features/games/game-list";

/**
 * Never prerendered: this page renders the signed-in user's games, so a build-time snapshot would
 * be both wrong and a database call during `next build`.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your games — ChessCoach AI",
};

/**
 * Game history (US-B1, US-B3).
 *
 * Auth is checked on the server: an unauthenticated visitor is redirected
 * before any of their data-shaped UI renders, rather than being shown a shell
 * that then fails its fetch.
 */
export default async function GamesPage() {
  const db = await getDb();
  const user = await currentUser(db);
  if (!user) redirect("/login?redirect_to=/games");

  // Fetched server-side so the list is present in the first paint rather than
  // arriving after a client round-trip.
  const rows = await listGames(db, user.id, { limit: 20 });
  // `payload` is the full game JSON; deliberately dropped from the list
  // response — sending 20 whole games would make the list slow for no benefit.
  const initialGames: GameListItem[] = rows.map((row) => {
    const { payload: _payload, ...rest } = row;
    return { ...rest, analyzed: (rest.analyzed ?? 0) > 0 } as GameListItem;
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Your games</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Signed in as {user.lichess_name}
          </p>
        </div>
        <nav className="flex gap-3 text-sm">
          <Link className="underline underline-offset-2" href="/dashboard">
            Dashboard
          </Link>
          <Link className="underline underline-offset-2" href="/account">
            Account
          </Link>
        </nav>
      </header>

      <GameList initialGames={initialGames} />
    </main>
  );
}
