"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { DashboardAggregate, Stat, Weakness } from "@/dashboard/aggregate";

/**
 * Weakness dashboard (US-E1, US-E2) — the retention feature.
 *
 * Mobile-first (D-08). Every number routes through `StatValue`, which renders
 * the insufficient case as an explicit message. That is the US-E1 requirement
 * made structural: there is no code path that prints a number the sample does
 * not support.
 */

export type DashboardPayload = {
  ok: boolean;
  aggregate: DashboardAggregate;
  weaknesses: Weakness[];
  totalReports: number;
};

const WINDOWS = [25, 50, 100] as const;

export function DashboardView({ initial }: { initial: DashboardPayload }) {
  const [windowSize, setWindowSize] = useState<number>(initial.aggregate.window);
  const [data, setData] = useState<DashboardPayload>(initial);
  const [pending, startTransition] = useTransition();

  // Window changes are a user action, so they refetch from a handler. Doing it
  // in an effect would re-run on every render path and add a client waterfall
  // to a page that is already server-rendered.
  function selectWindow(next: number) {
    setWindowSize(next);
    startTransition(async () => {
      const response = await fetch(`/api/dashboard?window=${next}`);
      if (response.status === 401) {
        window.location.href = "/login?redirect_to=/dashboard";
        return;
      }
      setData((await response.json()) as DashboardPayload);
    });
  }

  return (
    <div className={`flex flex-col gap-6 ${pending ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-black/60 dark:text-white/60">Window</span>
        {WINDOWS.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => selectWindow(w)}
            aria-pressed={windowSize === w}
            className={`rounded-md border px-3 py-1 text-xs font-medium ${
              windowSize === w
                ? "border-black/40 bg-black/10 dark:border-white/40 dark:bg-white/15"
                : "border-black/15 dark:border-white/20"
            }`}
          >
            Last {w}
          </button>
        ))}
      </div>

      {data.totalReports === 0 ? (
        <p className="rounded-lg border border-black/10 p-4 text-sm text-black/70 dark:border-white/15 dark:text-white/70">
          No analysed games yet. Analyse a few games and your patterns will show up here.{" "}
          <Link className="underline" href="/games">
            Go to your games
          </Link>
          .
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Overall</h2>
            <div className="grid grid-cols-2 gap-2">
              <Card label="Average accuracy">
                <StatValue stat={data.aggregate.accuracy} suffix="" />
              </Card>
              <Card label="Games analysed">
                <span className="text-xl font-semibold tabular-nums">
                  {data.aggregate.gamesAnalyzed}
                </span>
              </Card>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Mistakes per game, by phase</h2>
            <div className="grid grid-cols-3 gap-2">
              {(["opening", "middlegame", "endgame"] as const).map((phase) => (
                <Card key={phase} label={phase}>
                  <StatValue stat={data.aggregate.blunderRateByPhase[phase]} />
                </Card>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Time trouble</h2>
            <Card label="Share of mistakes made on a low clock">
              <StatValue stat={data.aggregate.timeTrouble} suffix="%" />
            </Card>
          </section>

          <Split title="By colour" rows={data.aggregate.byColor} />
          <Split title="By time control" rows={data.aggregate.byTimeControl} />
          <Split title="By opening" rows={data.aggregate.byOpening.slice(0, 6)} />

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">What to work on</h2>
            {data.weaknesses.length === 0 ? (
              <p className="rounded-lg border border-black/10 p-3 text-sm text-black/70 dark:border-white/15 dark:text-white/70">
                Nothing recurring yet. We only report a pattern once it shows up in at least five
                games — anything less is noise, not a weakness.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.weaknesses.map((weakness) => (
                  <li
                    key={weakness.id}
                    className="flex flex-col gap-1 rounded-lg border border-black/10 p-3 dark:border-white/15"
                  >
                    <span className="text-sm font-medium">{weakness.title}</span>
                    <span className="text-xs text-black/70 dark:text-white/70">
                      {weakness.detail}
                    </span>
                    {/* US-E2: concrete linked examples, not just a claim. */}
                    <span className="flex flex-wrap gap-2 text-xs">
                      {weakness.exampleGameIds.slice(0, 5).map((id, i) => (
                        <Link
                          key={id}
                          href={`/games/${encodeURIComponent(id)}`}
                          className="underline underline-offset-2"
                        >
                          Example {i + 1}
                        </Link>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/**
 * The only place a statistic is rendered.
 *
 * US-E1: below the minimum sample we say so rather than printing a number the
 * data cannot support.
 */
function StatValue({ stat, suffix = "" }: { stat: Stat; suffix?: string }) {
  if (stat.kind === "insufficient") {
    return (
      <span className="text-xs text-black/50 dark:text-white/50">
        Not enough games yet ({stat.sample}/{stat.needed})
      </span>
    );
  }
  return (
    <span className="text-xl font-semibold tabular-nums">
      {stat.value}
      {suffix}
    </span>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-black/10 p-3 dark:border-white/15">
      <span className="text-xs capitalize text-black/60 dark:text-white/60">{label}</span>
      {children}
    </div>
  );
}

function Split({ title, rows }: { title: string; rows: DashboardAggregate["byColor"] }) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex items-center justify-between gap-3 rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/15"
          >
            <span className="min-w-0 truncate">{row.label}</span>
            <span className="flex shrink-0 items-center gap-3 text-xs">
              <span className="text-black/50 dark:text-white/50">{row.games}g</span>
              <StatValue stat={row.winRate} suffix="%" />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DashboardSkeleton() {
  return (
    <div
      className="flex flex-col gap-6"
      aria-busy="true"
      role="status"
      aria-label="Loading dashboard"
    >
      {[2, 3, 1].map((cols, i) => (
        <div key={i} className="flex flex-col gap-2" aria-hidden="true">
          <span className="block h-4 w-32 rounded bg-black/10 motion-safe:animate-pulse dark:bg-white/15" />
          <div className={`grid gap-2 grid-cols-${cols === 1 ? "1" : cols === 2 ? "2" : "3"}`}>
            {Array.from({ length: cols }, (_, j) => (
              <span
                key={j}
                className="block h-[4.5rem] rounded-lg bg-black/[0.06] motion-safe:animate-pulse dark:bg-white/[0.08]"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
