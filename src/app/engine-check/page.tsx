import { EngineSmokeTest } from "@/components/engine-smoke-test";

/**
 * Developer verification page for the engine (US-C1, NFR-C1).
 *
 * Exists because the engine's real failure modes — WASM load, NNUE fetch,
 * thread availability, UCI handshake — only appear in a browser. Unit tests
 * cover the parsing and planning; this covers the integration, and is what the
 * Playwright MCP drives.
 *
 * Not linked from the product UI. It renders no game data and provides no
 * analysis of anything a user is playing (NFR-L1).
 */
export default function EngineCheckPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Engine check</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Loads Stockfish in a Web Worker and evaluates a known position. Developer tool — not part
          of the product.
        </p>
      </header>
      <EngineSmokeTest />
    </main>
  );
}
