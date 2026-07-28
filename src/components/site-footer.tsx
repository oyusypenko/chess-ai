import Link from "next/link";

/**
 * Site footer.
 *
 * The legal links are not decoration: the attribution page carries our GPLv3
 * source offer (NFR-L3) and the privacy/terms pages are launch requirements
 * (NFR-PR2). They must be reachable from every page, which is why this lives in
 * the root layout.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-black/10 px-4 py-6 text-xs dark:border-white/15">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 text-black/60 dark:text-white/60">
        <Link className="underline underline-offset-2" href="/privacy">
          Privacy
        </Link>
        <Link className="underline underline-offset-2" href="/terms">
          Terms
        </Link>
        <Link className="underline underline-offset-2" href="/attribution">
          Open-source attribution
        </Link>
        <span className="ml-auto">
          Analysis by Stockfish (GPLv3). Not affiliated with Lichess or Chess.com.
        </span>
      </nav>
    </footer>
  );
}
