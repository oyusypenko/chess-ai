import { writeFileSync } from "node:fs";
import { seedDatabase } from "./seed";

/**
 * Playwright global setup.
 *
 * Runs before the web server starts, so the database exists by the time the app
 * opens it. The seed result is written to disk rather than passed in memory —
 * Playwright workers are separate processes and cannot share a module value.
 */
export const SEED_FILE = ".data/e2e-seed.json";

export default async function globalSetup() {
  const seed = await seedDatabase();
  writeFileSync(SEED_FILE, JSON.stringify(seed, null, 2));
  return async () => {
    // Nothing to tear down: the database is recreated on the next run, and
    // leaving it makes a failed run inspectable.
  };
}
