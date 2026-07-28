import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { sqliteDb } from "../../src/db/client";
import { migrate } from "../../src/db/index";
import {
  upsertUserByLichessId,
  createUserWithPassword,
  createSession,
  saveAccessToken,
  saveGame,
  saveReport,
} from "../../src/db/repositories";
import { hashPassword } from "../../src/auth/password";
import { generateKeyBase64 } from "../../src/db/crypto";
import type { NormalizedGame } from "../../src/model/game";

/**
 * Seeds a known database for end-to-end tests.
 *
 * **No test-only endpoint.** A `/api/test/login` route would be a real
 * authentication bypass living in production code, one misconfiguration away
 * from being reachable. Instead we write directly to the same SQLite file the
 * server reads, and hand Playwright the resulting session id to set as a
 * cookie — the server is exercised exactly as it ships.
 */

export const TEST_DB_PATH = ".data/e2e.sqlite";
export const TEST_KEY = generateKeyBase64();

export type SeedResult = {
  sessionId: string;
  userId: string;
  lichessName: string;
  gameIds: string[];
  /**
   * A second, throwaway account used only by the deletion test.
   *
   * Without it, deleting the main account would break every spec running in
   * parallel, and the suite would depend on file execution order — which is a
   * property Playwright does not guarantee and which fails intermittently
   * rather than loudly.
   */
  disposable: { sessionId: string; lichessName: string };
  /**
   * A second session for the SAME main user, used only by the logout test.
   * Logging out deletes a session row; sharing one would sign out every spec
   * running in parallel.
   */
  logoutSessionId: string;
  /**
   * An email + password account with NO Lichess link.
   *
   * Two things need it: signing in through the real form, and the "connect
   * Lichess" state of the account page, which only an unlinked account shows.
   */
  password: { email: string; password: string; userId: string; sessionId: string };
};

/** Known-good credentials. Long enough to satisfy the policy, and obviously fake. */
export const SEED_PASSWORD = "seed-account-passphrase-1";

/** Deterministic sample game. */
function game(index: number, overrides: Partial<NormalizedGame> = {}): NormalizedGame {
  const color = index % 2 === 0 ? "white" : "black";
  const result = index % 3 === 0 ? "loss" : "win";
  return {
    id: `seed${index}`,
    platform: "lichess",
    url: `https://lichess.org/seed${index}`,
    // Descending dates so ordering assertions are meaningful.
    playedAt: `2026-05-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
    speed: index % 2 === 0 ? "blitz" : "rapid",
    timeControl: { kind: "clock", initialSeconds: 300, incrementSeconds: 0 },
    rated: true,
    // Derived from `color`, never hardcoded. Pinning White to "SeedUser" while
    // the subject alternates colour produced games where the opponent WAS the
    // subject — the list then rendered "vs SeedUser", which is not a thing that
    // can happen and made a correct assertion look wrong.
    players: {
      [color]: { username: "SeedUser", rating: 1500, ratingDiff: 4, isBot: false },
      [color === "white" ? "black" : "white"]: {
        username: `opponent${index}`,
        rating: 1490,
        ratingDiff: -4,
        isBot: false,
      },
    } as NormalizedGame["players"],
    subject: { username: "SeedUser", color, result },
    status: "resign",
    winner: result === "win" ? color : color === "white" ? "black" : "white",
    opening: { eco: "C50", name: "Italian Game" },
    initialFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    moves: [],
    finished: true,
    ...overrides,
  };
}

/**
 * Every table, children before parents.
 *
 * `users` cascades, but listing them explicitly means a table that is ever
 * added *without* a cascade still gets cleared instead of quietly leaking rows
 * between runs.
 */
const TABLES = [
  "reports",
  "games",
  "sessions",
  "oauth_tokens",
  "oauth_states",
  "auth_throttle",
  "waitlist",
  "users",
];

export async function seedDatabase(): Promise<SeedResult> {
  mkdirSync(dirname(TEST_DB_PATH), { recursive: true });

  const db = await sqliteDb(TEST_DB_PATH);

  // Wipe the CONTENTS, never the file.
  //
  // Deleting and recreating the file looks equivalent and is not: Playwright
  // starts the web server concurrently with global setup, and its readiness
  // probe hits `/`, which — since the header renders signed-in state — opens
  // this database. Unlinking the file then leaves the server holding a handle
  // to a deleted inode for the rest of the run, so it reads a database nothing
  // else can see. Seeded sessions vanish while sessions the server creates
  // itself work perfectly, which is a maddening way to spend an afternoon.
  await migrate(db);
  for (const table of TABLES) {
    await db.run(`DELETE FROM ${table}`);
  }

  const user = await upsertUserByLichessId(db, "seeduser", "SeedUser");
  await saveAccessToken(db, user.id, "lio_seed_token", TEST_KEY);
  const session = await createSession(db, user.id);

  const gameIds: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    gameIds.push(await saveGame(db, user.id, game(i)));
  }

  // Analyse enough games that the dashboard clears its minimum-sample rule
  // (n >= 10) — otherwise every statistic renders as "not enough games yet"
  // and the assertions would be testing the wrong branch.
  for (let i = 0; i < 11; i += 1) {
    await saveReport(db, {
      game_id: gameIds[i],
      user_id: user.id,
      engine_version: "sf18-smallnet-d18n1m-v1",
      prompt_version: "report-v1",
      model: "claude-haiku-4-5",
      summary_text: "You developed quickly and kept your king safe.",
      summary_status: "ok",
      accuracy: 78 + (i % 12),
      classification: JSON.stringify({
        subjectCounts: { good: 12, inaccuracy: 2, mistake: 1 },
        accuracy: { white: 82, black: 79 },
        moves: [
          {
            ply: 31,
            san: "Qh5",
            color: i % 2 === 0 ? "white" : "black",
            classification: "mistake",
            label: "Mistake",
            description: "Changed the assessment of the position.",
            severity: 2,
            loss: 0.24,
            accuracy: 38,
            playedBest: false,
            clockCentis: 1200,
            fenBefore: "",
            fenAfter: "",
          },
        ],
        meta: {
          playedAt: `2026-05-${String(i + 1).padStart(2, "0")}T12:00:00.000Z`,
          speed: i % 2 === 0 ? "blitz" : "rapid",
          color: i % 2 === 0 ? "white" : "black",
          result: i % 3 === 0 ? "loss" : "win",
          eco: "C50",
          openingName: "Italian Game",
          initialCentis: 30000,
        },
      }),
      evals: JSON.stringify({ 0: { cp: 20, provenance: "local-engine", depth: 18 } }),
    });
  }

  // Throwaway account for the deletion test — see `disposable` above.
  const doomed = await upsertUserByLichessId(db, "doomeduser", "DoomedUser");
  await saveAccessToken(db, doomed.id, "lio_doomed_token", TEST_KEY);
  const doomedSession = await createSession(db, doomed.id);
  const logoutSession = await createSession(db, user.id);
  await saveGame(db, doomed.id, game(99, { id: "doomed0" }));

  // Email + password accounts. Hashing is real (~72 ms each) rather than a
  // pre-baked constant: a hash format change must break the seed, not pass it.
  const passwordUser = await createUserWithPassword(
    db,
    "seed.password@example.com",
    await hashPassword(SEED_PASSWORD),
  );
  const passwordSession = await createSession(db, passwordUser.id, { authMethod: "password" });

  return {
    sessionId: session.id,
    userId: user.id,
    lichessName: user.lichess_name!,
    // The last game is deliberately left unanalysed so the "Analysed" badge has
    // both states to assert against.
    gameIds,
    disposable: { sessionId: doomedSession.id, lichessName: doomed.lichess_name! },
    logoutSessionId: logoutSession.id,
    password: {
      email: "seed.password@example.com",
      password: SEED_PASSWORD,
      userId: passwordUser.id,
      sessionId: passwordSession.id,
    },
  };
}
