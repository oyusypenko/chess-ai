import type { Db } from "./client";
import { decryptToken, encryptToken, type EncryptedValue } from "./crypto";
import type { NormalizedGame } from "@/model/game";

/**
 * Typed data access (P1).
 *
 * Plain SQL behind named functions rather than an ORM: the queries are few, the
 * shapes are stable, and a hand-written query is the one that actually runs —
 * no generated SQL to reverse-engineer when something is slow or wrong.
 */

export type UserRecord = {
  id: string;
  lichess_id: string;
  lichess_name: string;
  created_at: string;
  last_seen_at: string;
  plan: "free" | "paid";
  plan_until: string | null;
  deletion_requested_at: string | null;
};

export type GameRow = {
  id: string;
  user_id: string;
  platform: string;
  platform_game_id: string;
  played_at: string;
  speed: string;
  time_control: string;
  rated: number;
  subject_color: "white" | "black";
  subject_result: "win" | "loss" | "draw";
  opponent_name: string | null;
  opponent_rating: number | null;
  subject_rating: number | null;
  eco: string | null;
  opening_name: string | null;
  move_count: number;
  payload: string;
  imported_at: string;
  /** Present on list queries — whether a report exists (US-B1 "analyzed" badge). */
  analyzed?: number;
};

export type ReportRow = {
  id: string;
  game_id: string;
  user_id: string;
  engine_version: string;
  prompt_version: string | null;
  model: string | null;
  summary_text: string;
  summary_status: string;
  accuracy: number | null;
  classification: string;
  evals: string;
  created_at: string;
};

const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------- users

export async function upsertUserByLichessId(
  db: Db,
  lichessId: string,
  lichessName: string,
): Promise<UserRecord> {
  const existing = await db.first<UserRecord>("SELECT * FROM users WHERE lichess_id = ?", [
    lichessId,
  ]);

  if (existing) {
    await db.run("UPDATE users SET last_seen_at = ?, lichess_name = ? WHERE id = ?", [
      nowIso(),
      lichessName,
      existing.id,
    ]);
    return { ...existing, lichess_name: lichessName, last_seen_at: nowIso() };
  }

  const user: UserRecord = {
    id: crypto.randomUUID(),
    lichess_id: lichessId,
    lichess_name: lichessName,
    created_at: nowIso(),
    last_seen_at: nowIso(),
    plan: "free",
    plan_until: null,
    deletion_requested_at: null,
  };
  await db.run(
    `INSERT INTO users (id, lichess_id, lichess_name, created_at, last_seen_at, plan)
     VALUES (?, ?, ?, ?, ?, 'free')`,
    [user.id, user.lichess_id, user.lichess_name, user.created_at, user.last_seen_at],
  );
  return user;
}

export function getUser(db: Db, userId: string): Promise<UserRecord | null> {
  return db.first<UserRecord>("SELECT * FROM users WHERE id = ?", [userId]);
}

/**
 * US-A4: full deletion. One statement, because every user-owned table cascades
 * from `users` — a checklist of DELETEs is a checklist someone forgets to
 * update when a table is added.
 */
export async function deleteUser(db: Db, userId: string): Promise<void> {
  await db.run("DELETE FROM users WHERE id = ?", [userId]);
}

export async function requestDeletion(db: Db, userId: string): Promise<void> {
  await db.run("UPDATE users SET deletion_requested_at = ? WHERE id = ?", [nowIso(), userId]);
}

// ---------------------------------------------------------------- tokens

export async function saveAccessToken(
  db: Db,
  userId: string,
  token: string,
  keyBase64: string,
  options: { expiresAt?: string | null; scopes?: string } = {},
): Promise<void> {
  const encrypted = await encryptToken(token, keyBase64);
  await db.run(
    `INSERT INTO oauth_tokens (user_id, provider, access_token_enc, iv, expires_at, scopes, created_at)
     VALUES (?, 'lichess', ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       access_token_enc = excluded.access_token_enc,
       iv = excluded.iv,
       expires_at = excluded.expires_at,
       scopes = excluded.scopes,
       created_at = excluded.created_at`,
    [
      userId,
      encrypted.ciphertext,
      encrypted.iv,
      options.expiresAt ?? null,
      options.scopes ?? "",
      nowIso(),
    ],
  );
}

export async function readAccessToken(
  db: Db,
  userId: string,
  keyBase64: string,
): Promise<string | null> {
  const row = await db.first<{ access_token_enc: string; iv: string }>(
    "SELECT access_token_enc, iv FROM oauth_tokens WHERE user_id = ?",
    [userId],
  );
  if (!row) return null;
  const value: EncryptedValue = { ciphertext: row.access_token_enc, iv: row.iv };
  try {
    return await decryptToken(value, keyBase64);
  } catch {
    // Key rotated, or the row is corrupt. Treat as "no token" so the user is
    // asked to re-authenticate rather than the request failing opaquely (US-A2
    // requires graceful handling of revocation).
    return null;
  }
}

export async function deleteAccessToken(db: Db, userId: string): Promise<void> {
  await db.run("DELETE FROM oauth_tokens WHERE user_id = ?", [userId]);
}

// ---------------------------------------------------------------- sessions

export async function createSession(
  db: Db,
  userId: string,
  ttlDays = 30,
): Promise<{ id: string; expiresAt: string }> {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000).toISOString();
  await db.run("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", [
    id,
    userId,
    nowIso(),
    expiresAt,
  ]);
  return { id, expiresAt };
}

export async function getSessionUser(db: Db, sessionId: string): Promise<UserRecord | null> {
  const row = await db.first<UserRecord & { expires_at: string }>(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?`,
    [sessionId, nowIso()],
  );
  return row ?? null;
}

export async function deleteSession(db: Db, sessionId: string): Promise<void> {
  await db.run("DELETE FROM sessions WHERE id = ?", [sessionId]);
}

/** Housekeeping: expired sessions and PKCE states are not worth retaining. */
export async function purgeExpired(db: Db): Promise<void> {
  const now = nowIso();
  await db.run("DELETE FROM sessions WHERE expires_at <= ?", [now]);
  await db.run("DELETE FROM oauth_states WHERE expires_at <= ?", [now]);
}

// ---------------------------------------------------------------- oauth state

export async function saveOAuthState(
  db: Db,
  state: string,
  codeVerifier: string,
  redirectTo: string | null,
  ttlMinutes = 10,
): Promise<void> {
  await db.run(
    "INSERT INTO oauth_states (state, code_verifier, redirect_to, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    [
      state,
      codeVerifier,
      redirectTo,
      nowIso(),
      new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
    ],
  );
}

/**
 * Read **and consume** the state.
 *
 * Single-use is the security property: without the delete, a leaked callback
 * URL could be replayed.
 */
export async function consumeOAuthState(
  db: Db,
  state: string,
): Promise<{ code_verifier: string; redirect_to: string | null } | null> {
  const row = await db.first<{
    code_verifier: string;
    redirect_to: string | null;
    expires_at: string;
  }>("SELECT code_verifier, redirect_to, expires_at FROM oauth_states WHERE state = ?", [state]);
  await db.run("DELETE FROM oauth_states WHERE state = ?", [state]);
  if (!row) return null;
  if (row.expires_at <= nowIso()) return null;
  return { code_verifier: row.code_verifier, redirect_to: row.redirect_to };
}

// ---------------------------------------------------------------- games

export async function saveGame(db: Db, userId: string, game: NormalizedGame): Promise<string> {
  const id = `${game.platform}:${game.id}`;
  const opponentColor = game.subject.color === "white" ? "black" : "white";
  await db.run(
    `INSERT INTO games (
       id, user_id, platform, platform_game_id, played_at, speed, time_control, rated,
       subject_color, subject_result, opponent_name, opponent_rating, subject_rating,
       eco, opening_name, move_count, payload, imported_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, imported_at = excluded.imported_at`,
    [
      id,
      userId,
      game.platform,
      game.id,
      game.playedAt,
      game.speed,
      describeTimeControl(game),
      game.rated ? 1 : 0,
      game.subject.color,
      game.subject.result,
      game.players[opponentColor].username,
      game.players[opponentColor].rating,
      game.players[game.subject.color].rating,
      game.opening.eco,
      game.opening.name,
      game.moves.length,
      JSON.stringify(game),
      nowIso(),
    ],
  );
  return id;
}

export type GameFilters = {
  speed?: string;
  color?: "white" | "black";
  result?: "win" | "loss" | "draw";
  limit?: number;
  offset?: number;
};

/**
 * Game list with the "analyzed" badge (US-B1, US-B3).
 *
 * The badge is a LEFT JOIN rather than a second round trip: asking "does a
 * report exist?" per row is the classic N+1 that makes a 20-row list feel slow.
 */
export async function listGames(
  db: Db,
  userId: string,
  filters: GameFilters = {},
): Promise<GameRow[]> {
  const where: string[] = ["g.user_id = ?"];
  const params: unknown[] = [userId];

  if (filters.speed) {
    where.push("g.speed = ?");
    params.push(filters.speed);
  }
  if (filters.color) {
    where.push("g.subject_color = ?");
    params.push(filters.color);
  }
  if (filters.result) {
    where.push("g.subject_result = ?");
    params.push(filters.result);
  }

  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);
  params.push(limit, offset);

  return db.all<GameRow>(
    `SELECT g.*, (SELECT COUNT(*) FROM reports r WHERE r.game_id = g.id) AS analyzed
     FROM games g
     WHERE ${where.join(" AND ")}
     ORDER BY g.played_at DESC
     LIMIT ? OFFSET ?`,
    params,
  );
}

export function getGame(db: Db, userId: string, gameId: string): Promise<GameRow | null> {
  // user_id in the predicate, always: a game id is guessable, so ownership is
  // enforced in the query rather than in a caller that might forget.
  return db.first<GameRow>("SELECT * FROM games WHERE id = ? AND user_id = ?", [gameId, userId]);
}

export function countGames(db: Db, userId: string): Promise<{ n: number } | null> {
  return db.first<{ n: number }>("SELECT COUNT(*) AS n FROM games WHERE user_id = ?", [userId]);
}

// ---------------------------------------------------------------- reports

export async function saveReport(
  db: Db,
  input: Omit<ReportRow, "id" | "created_at"> & { id?: string },
): Promise<string> {
  const id = input.id ?? crypto.randomUUID();
  await db.run(
    `INSERT INTO reports (
       id, game_id, user_id, engine_version, prompt_version, model,
       summary_text, summary_status, accuracy, classification, evals, created_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(game_id, engine_version) DO UPDATE SET
       summary_text = excluded.summary_text,
       summary_status = excluded.summary_status,
       prompt_version = excluded.prompt_version,
       model = excluded.model,
       accuracy = excluded.accuracy,
       classification = excluded.classification,
       evals = excluded.evals`,
    [
      id,
      input.game_id,
      input.user_id,
      input.engine_version,
      input.prompt_version,
      input.model,
      input.summary_text,
      input.summary_status,
      input.accuracy,
      input.classification,
      input.evals,
      nowIso(),
    ],
  );
  return id;
}

export function getReport(db: Db, userId: string, gameId: string): Promise<ReportRow | null> {
  return db.first<ReportRow>(
    "SELECT * FROM reports WHERE game_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1",
    [gameId, userId],
  );
}

export function listReports(db: Db, userId: string, limit = 100): Promise<ReportRow[]> {
  return db.all<ReportRow>(
    "SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    [userId, Math.min(limit, 500)],
  );
}

function describeTimeControl(game: NormalizedGame): string {
  const tc = game.timeControl;
  if (tc.kind === "clock") return `${Math.round(tc.initialSeconds / 60)}+${tc.incrementSeconds}`;
  if (tc.kind === "correspondence") return "correspondence";
  return "unlimited";
}
