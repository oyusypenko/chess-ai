import { EngineCapability } from "@/components/engine-capability";
import { WaitlistForm } from "@/components/waitlist-form";

/**
 * P0 landing page (US-A1).
 *
 * Mobile-first (D-08): single column, base classes for 360 px.
 *
 * The username→report flow is wired here at M7; the pieces it composes
 * (import, engine, classifier, report, summary) all landed in M2–M6. The
 * waitlist capture is the P0 conversion goal — validating demand before
 * building billing.
 */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">ChessCoach AI</h1>
        <p className="text-base text-black/70 dark:text-white/70">
          Your finished games, analysed by Stockfish in your browser and explained in plain
          language. What went wrong, why, and what to practise.
        </p>
        <p className="text-sm text-black/60 dark:text-white/60">
          Post-game only — we never help during a live game.
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
          Preview build. The analysis pipeline is complete end to end; see{" "}
          <a className="underline" href="/report-preview">
            a sample report
          </a>
          .
        </p>
      </section>

      <EngineCapability />

      <section
        aria-labelledby="waitlist-heading"
        className="rounded-lg border border-black/10 p-4 dark:border-white/15"
      >
        <h2 id="waitlist-heading" className="sr-only">
          Join the waitlist
        </h2>
        <WaitlistForm />
      </section>
    </main>
  );
}
