"use client";

import { useSyncExternalStore } from "react";
import {
  detectEngineThreadingSupport,
  type EngineThreadingSupport,
} from "@/lib/cross-origin-isolation";

/**
 * Shows whether this browser can run the multithreaded engine build (US-C1,
 * NFR-C1, FR-7).
 *
 * Uses `useSyncExternalStore` rather than `useState` + `useEffect`: the value
 * lives outside React (it is a browser capability), it cannot be known during
 * SSR, and it never changes after load. That is precisely what this hook is
 * for, and it avoids the set-state-in-effect pattern React 19 flags.
 *
 * Single-threaded is a *supported* path, not a failure — the copy says
 * "slower", never "unsupported", which is the expectations messaging US-C1
 * asks for.
 */

// `getSnapshot` must return a referentially stable value or React re-renders
// forever. Detection is deterministic per page load, so compute once and cache.
let cached: EngineThreadingSupport | null = null;
function getSnapshot(): EngineThreadingSupport {
  cached ??= detectEngineThreadingSupport();
  return cached;
}

// Capability cannot change during the page's lifetime — nothing to subscribe to.
function subscribe(): () => void {
  return () => {};
}

// During SSR and the hydrating render there is no answer yet; `null` renders
// the "Checking…" state on both server and client, so hydration matches.
function getServerSnapshot(): EngineThreadingSupport | null {
  return null;
}

export function EngineCapability() {
  const support = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <section
      aria-labelledby="engine-heading"
      className="rounded-lg border border-black/10 p-4 dark:border-white/15"
    >
      <h2 id="engine-heading" className="text-sm font-medium">
        Engine capability
      </h2>

      {/* aria-live: the value appears after hydration, so screen readers need to
          be told it arrived rather than silently missing it. */}
      <div aria-live="polite" className="mt-2 text-sm">
        {support === null ? (
          <p className="text-black/50 dark:text-white/50">Checking…</p>
        ) : support.threaded ? (
          <p>
            <span aria-hidden="true">✅ </span>
            Multithreaded analysis available — this browser is cross-origin isolated.
          </p>
        ) : (
          <p>
            <span aria-hidden="true">ℹ️ </span>
            Single-threaded analysis will be used, so games take longer to analyze. Everything still
            works.
          </p>
        )}
      </div>

      {support !== null && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-black/60 dark:text-white/60">
          <dt>crossOriginIsolated</dt>
          <dd>{String(support.crossOriginIsolated)}</dd>
          <dt>SharedArrayBuffer</dt>
          <dd>{String(support.sharedArrayBuffer)}</dd>
        </dl>
      )}
    </section>
  );
}
