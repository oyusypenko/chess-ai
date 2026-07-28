import Link from "next/link";

/**
 * Site footer.
 *
 * The legal links are not decoration: the attribution page carries our GPLv3
 * source offer (NFR-L3) and the privacy/terms pages are launch requirements
 * (NFR-PR2). They must be reachable from every page, which is why this lives in
 * the root layout.
 *
 * The fair-play line is stated here too. It is the constraint that shapes the
 * whole product, and burying it would be the wrong kind of quiet (NFR-L1).
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-black/10 dark:border-white/15">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:flex-row sm:gap-10">
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span aria-hidden="true">♞</span> ChessCoach AI
          </span>
          <p className="max-w-xs text-xs text-black/55 dark:text-white/55">
            Post-game coaching for Lichess players. We never assist during a live game.
          </p>
        </div>

        <nav aria-label="Product" className="flex flex-col gap-1.5 text-xs">
          <span className="font-medium text-black/70 dark:text-white/70">Product</span>
          <Link className="hover:underline" href="/report-preview">
            Sample report
          </Link>
          <Link className="hover:underline" href="/login">
            Sign in
          </Link>
          <Link className="hover:underline" href="/dashboard">
            Dashboard
          </Link>
        </nav>

        <nav aria-label="Legal" className="flex flex-col gap-1.5 text-xs">
          <span className="font-medium text-black/70 dark:text-white/70">Legal</span>
          <Link className="hover:underline" href="/privacy">
            Privacy
          </Link>
          <Link className="hover:underline" href="/terms">
            Terms
          </Link>
          <Link className="hover:underline" href="/attribution">
            Open-source attribution
          </Link>
        </nav>

        <p className="text-xs text-black/45 sm:ml-auto sm:max-w-[16rem] sm:text-right dark:text-white/45">
          Analysis by Stockfish (GPLv3). Not affiliated with Lichess or Chess.com.
        </p>
      </div>
    </footer>
  );
}
