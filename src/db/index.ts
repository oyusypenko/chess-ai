import { mkdirSync, readdirSync, readFileSync } from "node:fs";
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

/**
 * Apply every pending migration, in filename order, exactly once each.
 *
 * The ledger is not ceremony. `0001` is written entirely in `IF NOT EXISTS`
 * form, so re-running it on each cold start was harmless — but that property
 * does not survive the first migration that alters an existing table. `0002`
 * rebuilds `users`; running it twice would copy the table with NULLs in the new
 * columns and wipe every stored credential. Tracking what has been applied is
 * what makes a migration allowed to be destructive-if-repeated.
 *
 * Ordering is lexicographic over zero-padded names, which is why they are
 * numbered `0001`, `0002` rather than `1`, `2` — `10` sorts before `2`.
 */
export async function migrate(db: Db): Promise<void> {
  const dir = join(process.cwd(), "migrations");

  await db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name       TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     );`,
  );

  const applied = new Set(
    (await db.all<{ name: string }>("SELECT name FROM schema_migrations")).map((r) => r.name),
  );

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    await db.exec(readFileSync(join(dir, file), "utf8"));
    await db.run("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)", [
      file,
      new Date().toISOString(),
    ]);
  }
}

export type { Db };
