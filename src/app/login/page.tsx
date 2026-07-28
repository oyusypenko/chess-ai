import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign in — ChessCoach AI",
  description: "Connect your Lichess account to save your reports and track your progress.",
};

/**
 * Login page (US-A2).
 *
 * Mobile-first (D-08). The copy states exactly what we ask for and what we do
 * not, because the honest version is also the reassuring one: we request **no
 * permissions at all**, which is unusual enough to be worth saying plainly.
 */

const ERRORS: Record<string, string> = {
  missing_parameters: "That sign-in link was incomplete. Please try again.",
  expired_or_replayed: "That sign-in link expired. Please start again.",
  provider_error: "Lichess couldn't complete the sign-in. Please try again.",
  not_configured: "Sign-in isn't configured on this deployment yet.",
  unexpected: "Something went wrong signing you in. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; declined?: string; redirect_to?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ? (ERRORS[params.error] ?? ERRORS.unexpected) : null;
  const redirectTo = params.redirect_to ?? "/games";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-black/70 dark:text-white/70">
          Connect your Lichess account to keep your reports and see your weaknesses across games.
        </p>
      </header>

      {params.declined ? (
        <p
          className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/15"
          role="status"
        >
          No problem — you can still analyse a game without an account.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {/* A link, not a fetch: the OAuth flow is a full-page redirect. */}
      <a
        href={`/api/auth/login?redirect_to=${encodeURIComponent(redirectTo)}`}
        className="flex w-full items-center justify-center rounded-md border border-black/20 px-4 py-3 text-sm font-medium dark:border-white/25"
      >
        Continue with Lichess
      </a>

      <section className="flex flex-col gap-2 rounded-lg border border-black/10 p-3 text-xs dark:border-white/15">
        <h2 className="text-sm font-medium">What we ask for</h2>
        <p className="text-black/70 dark:text-white/70">
          <strong>No permissions at all.</strong> We request zero scopes — we can read your public
          games the same way anyone can, and the connection only tells us which account is yours.
        </p>
        <ul className="list-disc pl-4 text-black/70 dark:text-white/70">
          <li>We cannot play moves, send messages, or change anything on your account.</li>
          <li>Your access token is encrypted before it is stored.</li>
          <li>
            You can disconnect at any time from{" "}
            <a className="underline" href="https://lichess.org/account/oauth/token">
              your Lichess token settings
            </a>
            , or delete your data from your account page.
          </li>
        </ul>
      </section>

      <p className="text-xs text-black/50 dark:text-white/50">
        By signing in you agree to our{" "}
        <Link className="underline" href="/terms">
          terms
        </Link>{" "}
        and{" "}
        <Link className="underline" href="/privacy">
          privacy policy
        </Link>
        .
      </p>
    </main>
  );
}
