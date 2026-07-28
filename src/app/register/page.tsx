import type { Metadata } from "next";
import Link from "next/link";
import { CredentialsForm } from "@/features/auth/credentials-form";
import { safeRedirect } from "@/auth/sign-in";

export const metadata: Metadata = {
  title: "Create an account — ChessCoach AI",
  description: "Create a ChessCoach AI account with your email address.",
};

/**
 * Registration (US-A2).
 *
 * The page is honest that an email-only account starts empty: without a linked
 * Lichess account there are no games to review, and a user who signs up
 * expecting otherwise lands on an empty games list wondering what broke.
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_to?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = safeRedirect(params.redirect_to, "/account");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
        <p className="text-sm text-black/70 dark:text-white/70">
          You can connect Lichess afterwards — that&rsquo;s what imports your games.
        </p>
      </header>

      <CredentialsForm mode="register" redirectTo={redirectTo} />

      <p className="text-sm text-black/70 dark:text-white/70">
        Already have an account?{" "}
        <Link
          className="underline underline-offset-2"
          href={`/login?redirect_to=${encodeURIComponent(redirectTo)}`}
        >
          Sign in
        </Link>
        .
      </p>

      <p className="rounded-lg border border-black/10 p-3 text-xs text-black/70 dark:border-white/15 dark:text-white/70">
        Prefer to skip the password?{" "}
        <Link className="underline" href="/login">
          Continue with Lichess
        </Link>{" "}
        instead — it creates your account and imports your games in one step.
      </p>

      <p className="text-xs text-black/50 dark:text-white/50">
        By creating an account you agree to our{" "}
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
