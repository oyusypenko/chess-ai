/**
 * Database access (P1).
 *
 * One narrow interface over two implementations:
 *   * **D1** in production, reached through the Cloudflare binding.
 *   * **node:sqlite** for local development and tests — built into Node 22+,
 *     so it costs no dependency and speaks the same SQL dialect D1 does.
 *
 * Sharing a dialect is the point. An ORM translating between two engines would
 * mean the SQL that runs in tests is not the SQL that runs in production, which
 * is exactly where storage bugs hide.
 */

export type Row = Record<string, unknown>;

export interface Db {
  /** Rows for a SELECT. */
  all<T = Row>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  /** First row, or null. */
  first<T = Row>(sql: string, params?: readonly unknown[]): Promise<T | null>;
  /** INSERT/UPDATE/DELETE. */
  run(sql: string, params?: readonly unknown[]): Promise<void>;
  /** Execute a multi-statement script (migrations). */
  exec(sql: string): Promise<void>;
}

/** The subset of Cloudflare's D1 API we use. */
type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
};
type D1Database = {
  prepare(sql: string): D1PreparedStatement;
  exec(sql: string): Promise<unknown>;
};

export function d1Db(database: D1Database): Db {
  return {
    async all<T>(sql: string, params: readonly unknown[] = []) {
      const stmt = database.prepare(sql).bind(...params);
      return (await stmt.all<T>()).results;
    },
    async first<T>(sql: string, params: readonly unknown[] = []) {
      return database
        .prepare(sql)
        .bind(...params)
        .first<T>();
    },
    async run(sql: string, params: readonly unknown[] = []) {
      await database
        .prepare(sql)
        .bind(...params)
        .run();
    },
    async exec(sql: string) {
      // D1's exec wants one statement per line-group; splitting keeps migration
      // files readable rather than forcing them onto single lines.
      for (const statement of splitStatements(sql)) {
        await database.exec(statement);
      }
    },
  };
}

/** node:sqlite implementation for local dev and tests. */
export async function sqliteDb(path = ":memory:"): Promise<Db> {
  const { DatabaseSync } = (await import("node:sqlite")) as {
    DatabaseSync: new (p: string) => {
      prepare(sql: string): {
        all(...p: unknown[]): unknown[];
        get(...p: unknown[]): unknown;
        run(...p: unknown[]): unknown;
      };
      exec(sql: string): void;
    };
  };
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");

  return {
    async all<T>(sql: string, params: readonly unknown[] = []) {
      return db.prepare(sql).all(...normalize(params)) as T[];
    },
    async first<T>(sql: string, params: readonly unknown[] = []) {
      return (db.prepare(sql).get(...normalize(params)) as T | undefined) ?? null;
    },
    async run(sql: string, params: readonly unknown[] = []) {
      db.prepare(sql).run(...normalize(params));
    },
    async exec(sql: string) {
      db.exec(sql);
    },
  };
}

/**
 * node:sqlite rejects `undefined` and booleans; D1 tolerates them. Normalising
 * here means callers write the same code against both rather than remembering
 * which backend they are on.
 */
function normalize(params: readonly unknown[]): unknown[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    return p;
  });
}

function splitStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.split("\n").every((line) => line.trim().startsWith("--")))
    .map((s) => `${s};`);
}
