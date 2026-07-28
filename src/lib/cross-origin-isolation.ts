/**
 * Runtime capability detection for multithreaded WASM (US-C1, NFR-C1).
 *
 * The engine (M3) needs `SharedArrayBuffer` for its threaded build, which the
 * browser only exposes on a cross-origin-isolated document. Both must hold —
 * shipping the COOP/COEP headers is necessary but not sufficient, since a
 * browser may still withhold `SharedArrayBuffer` (older Safari, some embedded
 * webviews).
 *
 * Callers must treat single-threaded as a supported path, not an error state:
 * the fallback build works, it is just slower, and the UI messages that
 * expectation rather than failing.
 */
export type EngineThreadingSupport = {
  /** Document is cross-origin isolated (COOP/COEP applied and honoured). */
  crossOriginIsolated: boolean;
  /** `SharedArrayBuffer` is actually constructible. */
  sharedArrayBuffer: boolean;
  /** Both hold — the multithreaded engine build may be used. */
  threaded: boolean;
};

export function detectEngineThreadingSupport(): EngineThreadingSupport {
  // Server-side render: report no threading rather than guessing. The client
  // re-detects on mount.
  if (typeof globalThis.window === "undefined") {
    return {
      crossOriginIsolated: false,
      sharedArrayBuffer: false,
      threaded: false,
    };
  }

  const isolated = globalThis.crossOriginIsolated === true;
  // Feature-detect by construction: the constructor can exist while being
  // unusable in a non-isolated context.
  let sab = false;
  try {
    sab = typeof SharedArrayBuffer !== "undefined" && new SharedArrayBuffer(1).byteLength === 1;
  } catch {
    sab = false;
  }

  return {
    crossOriginIsolated: isolated,
    sharedArrayBuffer: sab,
    threaded: isolated && sab,
  };
}
