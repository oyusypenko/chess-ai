import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Open-source attribution — ChessCoach AI",
  description: "Licences and source offers for the open-source software ChessCoach AI ships.",
};

/**
 * Attribution page (NFR-L3, NFR-L2) — **legally required before launch**.
 *
 * GPLv3 §6 obliges us to accompany the Stockfish binaries we serve with a
 * written offer of the corresponding source. This page is that offer, and it
 * must stay accurate: `docs/attribution.md` is the maintained record, this is
 * its user-facing form.
 */
export default function AttributionPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Open-source attribution</h1>
        <p className="text-sm text-black/70 dark:text-white/70">
          ChessCoach AI is built on open-source software. This page lists what we ship, under which
          licence, and where to get the source.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Stockfish — GNU GPL v3</h2>
        <p className="text-sm">
          Analysis is performed by{" "}
          <a className="underline" href="https://github.com/official-stockfish/Stockfish">
            Stockfish
          </a>
          , a free and open-source chess engine licensed under the{" "}
          <a className="underline" href="https://www.gnu.org/licenses/gpl-3.0.html">
            GNU General Public License, version 3
          </a>
          . We serve the WebAssembly build published as{" "}
          <a className="underline" href="https://github.com/lichess-org/stockfish-web">
            @lichess-org/stockfish-web
          </a>{" "}
          (the <code>sf_18_smallnet</code> target), together with its neural network file.
        </p>
        <p className="text-sm">
          Stockfish runs in your browser as a separate WebAssembly program loaded at runtime. It is
          not linked into or combined with ChessCoach AI&rsquo;s own code.
        </p>
        <div className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/15">
          <h3 className="font-medium">Written offer of source code</h3>
          <p className="mt-1 text-black/70 dark:text-white/70">
            The complete corresponding source for the Stockfish binaries we distribute is available
            from the upstream projects linked above, including the build patches applied by
            stockfish-web. On request we will provide the exact sources corresponding to the
            binaries served from this site — contact details are on our contact page.
          </p>
          <p className="mt-2 text-xs text-black/50 dark:text-white/50">
            A copy of the GPLv3 licence text is served alongside the engine at{" "}
            <code>/engine/LICENSE.stockfish.txt</code>.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Libraries</h2>
        <ul className="flex flex-col gap-2 text-sm">
          <li>
            <a className="underline" href="https://github.com/jhlywa/chess.js">
              chess.js
            </a>{" "}
            — BSD-2-Clause. Move generation, SAN/FEN handling, PGN parsing.
          </li>
          <li>
            <a className="underline" href="https://github.com/Clariity/react-chessboard">
              react-chessboard
            </a>{" "}
            — MIT. Board rendering.
          </li>
          <li>
            <a className="underline" href="https://nextjs.org">
              Next.js
            </a>{" "}
            and{" "}
            <a className="underline" href="https://react.dev">
              React
            </a>{" "}
            — MIT.
          </li>
          <li>
            <a className="underline" href="https://tailwindcss.com">
              Tailwind CSS
            </a>{" "}
            — MIT.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Not affiliated</h2>
        <p className="text-sm text-black/70 dark:text-white/70">
          ChessCoach AI is not affiliated with, endorsed by, or connected to Lichess or Chess.com.
          Game data is read from their public APIs. Our move classifications, their names, and their
          icons are our own; we do not use any third-party piece sets, sounds, or badge artwork.
        </p>
      </section>
    </main>
  );
}
