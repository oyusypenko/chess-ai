import Link from "next/link";
import { EngineCapability } from "@/components/engine-capability";
import { WaitlistForm } from "@/components/waitlist-form";

/**
 * Landing page (US-A1).
 *
 * Mobile-first (D-08): single column at 360 px, widening at `sm:`/`lg:`.
 *
 * The copy leads with the problem rather than the technology. "Stockfish in a
 * Web Worker" means nothing to a 1200-rated player; "you can see the eval
 * dropped, but not why" is their actual experience.
 */

const FEATURES = [
  {
    icon: "♟",
    title: "Every move, classified",
    body: "Best, inaccuracy, mistake, costly — with the engine's preferred move beside your own, so you can see the alternative rather than just the verdict.",
  },
  {
    icon: "💬",
    title: "Explained in plain language",
    body: "A short written review of what actually decided the game. No engine lines to decode, and nothing it says about your game is invented — every move it mentions is checked against what you played.",
  },
  {
    icon: "📉",
    title: "The moments that mattered",
    body: "Three to five positions where the game turned, each with the move you played, the move that was there, and why the difference counted.",
  },
  {
    icon: "📊",
    title: "Patterns across games",
    body: "One game is an anecdote. The dashboard shows what keeps happening — which phase you lose ground in, which openings cost you, whether the clock is the real problem.",
  },
  {
    icon: "⚡",
    title: "Analysis runs in your browser",
    body: "Stockfish runs on your machine, not our servers. That makes it fast, private, and free — and it is why unlimited engine analysis costs you nothing.",
  },
  {
    icon: "🔒",
    title: "Sign-in that asks for nothing",
    body: "We request zero permissions from Lichess. We cannot play moves, send messages, or change anything on your account. Your token is encrypted before it is stored.",
  },
] as const;

const STEPS = [
  {
    n: "1",
    title: "Connect Lichess, or just paste a username",
    body: "Signing in saves your reports and unlocks the dashboard. You can also try a single game without an account.",
  },
  {
    n: "2",
    title: "Your game is analysed in your browser",
    body: "Stockfish evaluates every position to depth 18. Where Lichess has already analysed a game, we reuse those evaluations instead of repeating the work.",
  },
  {
    n: "3",
    title: "Every move gets a verdict",
    body: "Moves are graded on how much winning chance they cost you — not raw centipawns, because a 2-pawn swing in an already-won game means nothing.",
  },
  {
    n: "4",
    title: "You get a review you can act on",
    body: "The key moments, a short written explanation, and — once you have a few games in — the patterns worth practising.",
  },
] as const;

export default function Home() {
  return (
    <main className="flex w-full flex-1 flex-col">
      {/* ---------------------------------------------------------------- hero */}
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-12 sm:py-16">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">
          Know <em>why</em> you lost.
        </h1>
        <p className="max-w-2xl text-base text-black/70 sm:text-lg dark:text-white/70">
          Free engine analysis already tells you the evaluation dropped on move 23. It does not tell
          you what you missed, or what to do about it. ChessCoach AI reviews your finished games and
          explains them the way a coach would.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/login"
            className="rounded-md border border-black/20 bg-black px-5 py-2.5 text-sm font-medium text-white dark:border-white/25 dark:bg-white dark:text-black"
          >
            Connect Lichess
          </Link>
          <Link
            href="/report-preview"
            className="rounded-md border border-black/20 px-5 py-2.5 text-sm font-medium dark:border-white/25"
          >
            See a sample report
          </Link>
        </div>

        <p className="text-sm text-black/55 dark:text-white/55">
          Post-game only — we never help during a live game. Free to start, no card required.
        </p>
      </section>

      {/* ------------------------------------------------------------ features */}
      <section
        aria-labelledby="features-heading"
        className="border-t border-black/10 dark:border-white/15"
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12">
          <h2 id="features-heading" className="text-xl font-semibold tracking-tight sm:text-2xl">
            What you get
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <li
                key={feature.title}
                className="flex flex-col gap-2 rounded-lg border border-black/10 p-4 dark:border-white/15"
              >
                <span aria-hidden="true" className="text-xl">
                  {feature.icon}
                </span>
                <h3 className="text-sm font-semibold">{feature.title}</h3>
                <p className="text-sm text-black/70 dark:text-white/70">{feature.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* --------------------------------------------------------- how it works */}
      <section
        aria-labelledby="how-heading"
        className="border-t border-black/10 dark:border-white/15"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12">
          <h2 id="how-heading" className="text-xl font-semibold tracking-tight sm:text-2xl">
            How it works
          </h2>
          <ol className="flex flex-col gap-5">
            {STEPS.map((step) => (
              <li key={step.n} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/20 text-sm font-semibold dark:border-white/25"
                >
                  {step.n}
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold">{step.title}</h3>
                  <p className="text-sm text-black/70 dark:text-white/70">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <aside className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
            <h3 className="font-semibold">Why you can trust the write-up</h3>
            <p className="mt-1 text-black/70 dark:text-white/70">
              The engine decides what is good or bad — the language model only puts those findings
              into words. Before anything is shown to you, every move and square it mentions is
              checked against your actual game. If it invents something, that sentence never reaches
              you.
            </p>
          </aside>
        </div>
      </section>

      {/* ------------------------------------------------------- engine + waitlist */}
      <section className="border-t border-black/10 dark:border-white/15">
        <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-12 lg:grid-cols-2">
          <EngineCapability />
          <div className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
            <h2 className="text-sm font-semibold">Not ready to sign in?</h2>
            <p className="text-sm text-black/70 dark:text-white/70">
              Leave your email and we&rsquo;ll tell you when the full weakness dashboard is ready.
            </p>
            <WaitlistForm />
          </div>
        </div>
      </section>
    </main>
  );
}
