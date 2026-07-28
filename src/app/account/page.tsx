import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/db";
import { currentUser } from "@/auth/session";
import { resolveEntitlements } from "@/server/entitlements";
import { countGames } from "@/db/repositories";
import { AccountActions } from "@/features/account/account-actions";

/**
 * Never prerendered: this page renders account state, so a build-time snapshot would
 * be both wrong and a database call during `next build`.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account — ChessCoach AI",
};

/** Account page: plan state, data export, and deletion (US-A4, US-F3, NFR-PR3). */
export default async function AccountPage() {
  const db = await getDb();
  const user = await currentUser(db);
  if (!user) redirect("/login?redirect_to=/account");

  const entitlements = resolveEntitlements(user);
  const games = await countGames(db, user.id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <nav className="flex gap-3 text-sm">
          <Link className="underline underline-offset-2" href="/games">
            Games
          </Link>
          <Link className="underline underline-offset-2" href="/dashboard">
            Dashboard
          </Link>
        </nav>
      </header>

      <section className="flex flex-col gap-2 rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h2 className="text-sm font-semibold">Connected account</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-black/60 dark:text-white/60">Lichess</dt>
          <dd>{user.lichess_name}</dd>
          <dt className="text-black/60 dark:text-white/60">Member since</dt>
          <dd>{new Date(user.created_at).toLocaleDateString()}</dd>
          <dt className="text-black/60 dark:text-white/60">Games stored</dt>
          <dd className="tabular-nums">{games?.n ?? 0}</dd>
        </dl>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h2 className="text-sm font-semibold">Plan</h2>
        <p className="text-sm">
          <span className="font-medium capitalize">{entitlements.plan}</span>
          {entitlements.inGracePeriod ? (
            <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">
              (payment issue — access continues during the grace period)
            </span>
          ) : null}
        </p>
        <p className="text-xs text-black/60 dark:text-white/60">
          {entitlements.reportsPerDay} AI-written reviews per day. Engine analysis is unlimited and
          always free — it runs in your browser and costs us nothing.
        </p>
        <p className="text-xs text-black/50 dark:text-white/50">
          Upgrading isn&rsquo;t available yet — we haven&rsquo;t chosen a payment provider.
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h2 className="text-sm font-semibold">Your data</h2>
        <p className="text-xs text-black/60 dark:text-white/60">
          Download everything we hold, or delete it. Deletion is immediate and cannot be undone.
        </p>
        <AccountActions lichessName={user.lichess_name} />
      </section>
    </main>
  );
}
