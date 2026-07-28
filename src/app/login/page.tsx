import type { Metadata } from "next";
import Link from "next/link";
import { CredentialsForm } from "@/features/auth/credentials-form";
import { safeRedirect } from "@/auth/sign-in";

export const metadata: Metadata = {
  title: "Sign in — ChessCoach AI",
  description: "Sign in with your email, or connect your Lichess account.",
};

/**
 * Login page (US-A2).
 *
 * Two ways in, and the order is deliberate: Lichess first, because a user who
 * connects it gets their games imported immediately, while an email account
 * starts empty until they link one. The email form is offered plainly beneath
 * rather than hidden behind a "more options" toggle — people who want it should
 * not have to hunt.
 *
 * Mobile-first (D-08).
 */

const ERRORS: Record<string, string> = {
  missing_parameters: "That sign-in link was incomplete. Please try again.",
  expired_or_replayed: "That sign-in link expired. Please start again.",
  provider_error: "Lichess couldn't complete the sign-in. Please try again.",
  not_configured: "Sign-in isn't configured on this deployment yet.",
  lichess_already_linked:
    "That Lichess account is already connected to a different ChessCoach account.",
  lichess_mismatch:
    "That Lichess account isn't the one connected to the account you're signed in to. Sign out first, then try again.",
  unexpected: "Something went wrong signing you in. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; declined?: string; redirect_to?: string }>;
}) {
  const params = await searchParams;
  const error = params.error ? (ERRORS[params.error] ?? ERRORS.unexpected) : null;
  // Validated here as well as in the API route: this value is interpolated into
  // a link the user clicks, so it must not be able to point off-site.
  const redirectTo = safeRedirect(params.redirect_to);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-black/70 dark:text-white/70">
          Keep your reports and see your weaknesses across games.
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

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
        <span className="text-xs text-black/45 dark:text-white/45">or</span>
        <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
      </div>

      <CredentialsForm mode="signin" redirectTo={redirectTo} />

      <p className="text-sm text-black/70 dark:text-white/70">
        Don&rsquo;t have an account?{" "}
        <Link
          className="underline underline-offset-2"
          href={`/register?redirect_to=${encodeURIComponent(redirectTo)}`}
        >
          Create one
        </Link>
        .
      </p>

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
