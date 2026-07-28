import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { d1Db, sqliteDb, type Db } from "./client";

/**
 * Database handle resolution.
 *
 * Production: the Cloudflare D1 binding. Local development: a file-backed
 * SQLite database created and migrated on first use, so `npm run dev` works
 * with no setup step — a database you have to remember to provision is a
 * database that is missing when someone else clones the repo.
 */

type CloudflareEnv = { DB?: unknown };

let cached: Db | null = null;

export async function getDb(): Promise<Db> {
  if (cached) return cached;

  const binding = await tryCloudflareBinding();
  if (binding) {
    cached = d1Db(binding as Parameters<typeof d1Db>[0]);
    return cached;
  }

  // Local fallback. Persisted to disk so a dev restart does not sign you out.
  const path = process.env.LOCAL_DB_PATH ?? ".data/chess-ai.sqlite";
  // Create the directory rather than failing on a fresh clone — a setup step
  // people have to remember is a setup step that gets skipped.
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    // Already exists, or read-only FS; sqliteDb will report the real problem.
  }
  const db = await sqliteDb(path);
  await migrate(db);
  cached = db;
  return cached;
}

/** Test seam: inject an in-memory database. */
export function setDb(db: Db | null): void {
  cached = db;
}

async function tryCloudflareBinding(): Promise<unknown | null> {
  try {
    const { getCloudflareContext } = (await import("@opennextjs/cloudflare")) as {
      getCloudflareContext: () => { env: CloudflareEnv };
    };
    return getCloudflareContext().env.DB ?? null;
  } catch {
    // Not running under Cloudflare (plain `next dev`, tests, Docker) — fall
    // through to SQLite rather than failing.
    return null;
  }
}

export async function migrate(db: Db): Promise<void> {
  const schema = readFileSync(join(process.cwd(), "migrations", "0001_initial.sql"), "utf8");
  await db.exec(schema);
}

export type { Db };
