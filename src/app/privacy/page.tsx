import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy — ChessCoach AI",
  description: "What ChessCoach AI collects, why, and how to have it deleted.",
};

/**
 * Privacy policy (NFR-PR2) — **required before launch**.
 *
 * ⚠️ This is an engineering draft that accurately describes what the software
 * currently does. It is **not legal advice and has not been reviewed by a
 * lawyer**. Before launch it needs a legal review, a named data controller, a
 * real contact address, and confirmation of the O-8 data-residency answer.
 * Those gaps are marked inline rather than papered over.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10 text-sm">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Privacy policy</h1>
        <p className="text-black/60 dark:text-white/60">Last updated: 28 July 2026</p>
      </header>

      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
        <p className="font-medium">Draft — pending legal review</p>
        <p className="mt-1 text-black/70 dark:text-white/70">
          This document describes what the software does today. It has not yet been reviewed by a
          lawyer, and the data-controller identity and contact address are not yet filled in. It
          must not be relied upon as a final policy.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">What we collect</h2>
        <ul className="list-disc pl-5">
          <li>
            <strong>The username you enter.</strong> Used to fetch your public games from Lichess.
            We do not store it.
          </li>
          <li>
            <strong>Your public game data.</strong> Moves, clocks, ratings, and result — already
            public on the platform you played on. Analysis happens in your browser.
          </li>
          <li>
            <strong>Your email address, only if you give it</strong> and tick the consent box. Used
            solely to tell you when the full product launches.
          </li>
          <li>
            <strong>Anonymous usage counts</strong> — how many people submitted a username, how many
            reached a report. These carry no username, email, or IP address.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">What we do not do</h2>
        <ul className="list-disc pl-5">
          <li>No third-party advertising or tracking scripts.</li>
          <li>No selling or sharing of personal data.</li>
          <li>
            No personal data sent to our AI provider. The written review is generated from engine
            output and public game facts only — never your email or account identifiers.
          </li>
          <li>
            No assistance during live games, ever. We only analyze games that are already finished.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Your rights</h2>
        <p>
          Under the GDPR you can ask us for a copy of your data, ask us to correct it, or ask us to
          delete it. Deletion is completed within 30 days and confirmed by email. Because the only
          personal data we hold in this preview is an email address you volunteered, deletion means
          removing that address.
        </p>
        <p className="text-black/60 dark:text-white/60">
          Contact details for these requests will be published here before launch.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Where data is processed</h2>
        <p>
          The application runs on Cloudflare&rsquo;s network. Analysis of your games happens locally
          in your browser and is not uploaded. The specific data-residency configuration is being
          finalised and will be stated here before launch.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Cookies</h2>
        <p>
          We do not use cookies for advertising or cross-site tracking. Analysis results are cached
          in your browser&rsquo;s local storage so re-opening a game does not re-analyze it; you can
          clear this at any time through your browser.
        </p>
      </section>
    </main>
  );
}
