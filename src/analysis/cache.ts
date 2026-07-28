import type { PositionEval } from "@/model/game";

/**
 * IndexedDB cache for completed analyses (US-C1, FR-3).
 *
 * US-C1: "re-opening a game never re-analyzes". FR-3: analysis is idempotent,
 * keyed by game **and engine version** — an engine upgrade must invalidate,
 * because evals from different engines are not interchangeable.
 *
 * Everything degrades to a miss. A browser with IndexedDB disabled or a private
 * window that refuses the store must still be able to analyze; it just pays the
 * cost each time. A cache is never allowed to be the reason a report fails.
 */

const DB_NAME = "chesscoach-analysis";
const DB_VERSION = 1;
const STORE = "analyses";

export type CachedAnalysis = {
  /** `${platform}:${gameId}:${engineVersion}` */
  readonly key: string;
  readonly gameKey: string;
  readonly engineVersion: string;
  /** Eval per ply; ply 0 is the starting position. */
  readonly evals: Record<number, PositionEval>;
  /** Best line per ply, UCI long algebraic — feeds key moments (US-D2). */
  readonly bestLines: Record<number, readonly string[]>;
  readonly completedAt: string;
};

export function analysisKey(gameKey: string, engineVersion: string): string {
  return `${gameKey}:${engineVersion}`;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    // Private windows and storage-blocked contexts land here — a miss, not an error.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

export async function readAnalysis(
  gameKey: string,
  engineVersion: string,
): Promise<CachedAnalysis | null> {
  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(analysisKey(gameKey, engineVersion));
      request.onsuccess = () => resolve((request.result as CachedAnalysis | undefined) ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    } finally {
      db.close();
    }
  });
}

export async function writeAnalysis(analysis: CachedAnalysis): Promise<void> {
  const db = await openDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(analysis);
      // Resolve either way: a failed cache write must never fail the analysis.
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    } finally {
      db.close();
    }
  });
}
