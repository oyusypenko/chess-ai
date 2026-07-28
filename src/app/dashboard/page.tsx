import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/db";
import { currentUser } from "@/auth/session";
import { listReports } from "@/db/repositories";
import { buildAggregate, detectWeaknesses, type ReportSummary } from "@/dashboard/aggregate";
import { phaseOf } from "@/report/build-payload";
import type { GameClassification } from "@/classifier/classify-game";
import { DashboardView, type DashboardPayload } from "@/features/dashboard/dashboard-view";

const LOW_CLOCK_FRACTION = 0.15;

/**
 * Build the initial view on the server using the same pure aggregate functions
 * the API route calls, so the first paint and every later refetch agree.
 */
function toSummaries(rows: Awaited<ReturnType<typeof listReports>>): ReportSummary[] {
  return rows.map((row) => {
    const classification = JSON.parse(row.classification) as GameClassification & {
      meta?: {
        playedAt?: string;
        speed?: string;
        color?: "white" | "black";
        result?: "win" | "loss" | "draw";
        eco?: string | null;
        openingName?: string | null;
        initialCentis?: number | null;
      };
    };
    const meta = classification.meta ?? {};
    const color = meta.color ?? "white";
    const initialCentis = meta.initialCentis ?? null;
    return {
      gameId: row.game_id,
      playedAt: meta.playedAt ?? row.created_at,
      speed: meta.speed ?? "unknown",
      color,
      result: meta.result ?? "draw",
      eco: meta.eco ?? null,
      openingName: meta.openingName ?? null,
      accuracy: row.accuracy,
      counts: classification.subjectCounts ?? {},
      mistakes: (classification.moves ?? [])
        .filter((m) => m.color === color && m.severity > 0)
        .map((m) => ({
          ply: m.ply,
          classification: m.classification,
          phase: phaseOf(m.ply, classification.moves.length),
          lowClock:
            initialCentis !== null &&
            m.clockCentis !== undefined &&
            m.clockCentis < initialCentis * LOW_CLOCK_FRACTION,
        })),
    };
  });
}

/**
 * Never prerendered: this page renders the signed-in user's statistics, so a build-time snapshot would
 * be both wrong and a database call during `next build`.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your weaknesses — ChessCoach AI",
};

/** Weakness dashboard (US-E1, US-E2). */
export default async function DashboardPage() {
  const db = await getDb();
  const user = await currentUser(db);
  if (!user) redirect("/login?redirect_to=/dashboard");

  const summaries = toSummaries(await listReports(db, user.id, 100));
  const initial: DashboardPayload = {
    ok: true,
    aggregate: buildAggregate(summaries, 25),
    weaknesses: [...detectWeaknesses(summaries.slice(0, 25))],
    totalReports: summaries.length,
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Your weaknesses</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            Patterns across your analysed games, not just one.
          </p>
        </div>
        <nav className="flex gap-3 text-sm">
          <Link className="underline underline-offset-2" href="/games">
            Games
          </Link>
          <Link className="underline underline-offset-2" href="/account">
            Account
          </Link>
        </nav>
      </header>

      <DashboardView initial={initial} />

      <p className="text-xs text-black/50 dark:text-white/50">
        How this works: we only report a statistic once we have at least 10 games behind it, and a
        recurring weakness only when it appears in at least 5. Anything less is noise.
      </p>
    </main>
  );
}
