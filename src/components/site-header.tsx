import Link from "next/link";
import { getDb } from "@/db";
import { currentUser } from "@/auth/session";
import { displayName } from "@/db/repositories";

/**
 * Site header.
 *
 * Renders on the server so the signed-in state is correct in the first paint —
 * a header that flashes "Sign in" and then swaps to a username is both a layout
 * shift and a moment of confusion (D-08).
 *
 * This exists because `/login` was previously reachable only by typing the URL.
 * A sign-in page nothing links to is, in practice, a sign-in page that does not
 * exist.
 */
export async function SiteHeader() {
  // Never let a header failure take down a page: an anonymous header is a fine
  // degradation, a 500 on every route is not.
  let user = null;
  try {
    user = await currentUser(await getDb());
  } catch {
    user = null;
  }

  return (
    <header className="border-b border-black/10 dark:border-white/15">
      <nav
        aria-label="Main"
        className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
      >
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden="true">♞</span>
          <span>ChessCoach AI</span>
        </Link>

        <div className="ml-auto flex items-center gap-3 text-sm">
          {user ? (
            <>
              <Link className="hover:underline" href="/games">
                Games
              </Link>
              <Link className="hover:underline" href="/dashboard">
                Dashboard
              </Link>
              <Link className="hover:underline" href="/account">
                {displayName(user)}
              </Link>
            </>
          ) : (
            <>
              <Link className="hover:underline" href="/report-preview">
                Sample report
              </Link>
              <Link
                href="/login"
                className="rounded-md border border-black/20 px-3 py-1.5 font-medium dark:border-white/25"
              >
                Sign in
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
