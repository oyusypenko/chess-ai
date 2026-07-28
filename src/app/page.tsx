import { EngineCapability } from "@/components/engine-capability";

/**
 * P0 landing placeholder (M1).
 *
 * The demo funnel — username input → report (US-A1) — lands in M2/M5. This
 * page exists so the scaffold is verifiable end to end and so cross-origin
 * isolation is observable in a real browser, not just in the smoke test.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">ChessCoach AI</h1>
        <p className="text-base text-black/70 dark:text-white/70">
          Post-game coaching for Lichess and chess.com players. Your games are analyzed by Stockfish
          in your browser, every move is classified, and the result is explained in plain language.
        </p>
      </header>

      <section
        aria-labelledby="status-heading"
        className="rounded-lg border border-black/10 p-4 dark:border-white/15"
      >
        <h2 id="status-heading" className="text-sm font-medium">
          Build status
        </h2>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Milestone M1 — scaffold and infrastructure. The analysis pipeline arrives in M2–M6; see{" "}
          <code className="rounded bg-black/5 px-1 py-0.5 dark:bg-white/10">docs/progress.md</code>.
        </p>
      </section>

      <EngineCapability />
    </main>
  );
}
