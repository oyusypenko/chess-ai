import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/db";
import { currentUser, readSessionId } from "@/auth/session";
import { resolveEntitlements } from "@/server/entitlements";
import { countGames, displayName, listSessions } from "@/db/repositories";
import { AccountActions } from "@/features/account/account-actions";
import { PasswordForm } from "@/features/account/password-form";
import { SessionList } from "@/features/account/session-list";

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
  const currentSessionId = await readSessionId();
  const sessions = (await listSessions(db, user.id)).map((session) => ({
    id: session.id,
    created_at: session.created_at,
    last_used_at: session.last_used_at,
    auth_method: session.auth_method,
    user_agent: session.user_agent,
    current: session.id === currentSessionId,
  }));

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
        {/* Not "Account" — that is the h1, and two headings with one name
            makes the page ambiguous to navigate by heading. */}
        <h2 className="text-sm font-semibold">Account details</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-black/60 dark:text-white/60">Email</dt>
          <dd>{user.email ?? <span className="text-black/50 dark:text-white/50">Not set</span>}</dd>
          <dt className="text-black/60 dark:text-white/60">Lichess</dt>
          <dd>
            {user.lichess_name ?? (
              // Without a linked Lichess account there is nothing to import, so
              // this is the one gap on the page worth offering a fix for inline.
              <a
                className="underline underline-offset-2"
                href="/api/auth/login?redirect_to=/account"
              >
                Connect Lichess
              </a>
            )}
          </dd>
          <dt className="text-black/60 dark:text-white/60">Member since</dt>
          <dd>{new Date(user.created_at).toLocaleDateString()}</dd>
          <dt className="text-black/60 dark:text-white/60">Games stored</dt>
          <dd className="tabular-nums">{games?.n ?? 0}</dd>
        </dl>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h2 className="text-sm font-semibold">
          {user.password_hash ? "Change your password" : "Set a password"}
        </h2>
        <p className="text-xs text-black/60 dark:text-white/60">
          {user.password_hash
            ? "You can sign in with your email and password."
            : "Add a password so you can sign in without Lichess."}
        </p>
        {/* Only whether a password exists crosses to the client — never the hash. */}
        <PasswordForm hasPassword={Boolean(user.password_hash)} />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
        <h2 className="text-sm font-semibold">Where you&rsquo;re signed in</h2>
        <p className="text-xs text-black/60 dark:text-white/60">
          Signing a device out takes effect immediately — sessions live on our server, so revoking
          one ends it on the spot.
        </p>
        <SessionList sessions={sessions} />
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
        <AccountActions lichessName={displayName(user)} />
      </section>
    </main>
  );
}
