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

/**
 * A user account.
 *
 * `lichess_id` and `email` are both nullable and at least one is always set —
 * an account exists because someone can sign in to it, and there are now two
 * ways to do that. The schema enforces the "at least one" part with a CHECK
 * rather than leaving it to whichever code path creates the row.
 */
export type UserRecord = {
  id: string;
  email: string | null;
  /** Never leaves the server. Absent means "no password set", never "any password". */
  password_hash: string | null;
  email_verified_at: string | null;
  lichess_id: string | null;
  lichess_name: string | null;
  created_at: string;
  last_seen_at: string;
  plan: "free" | "paid";
  plan_until: string | null;
  deletion_requested_at: string | null;
};

/**
 * What to call this person in the UI.
 *
 * Centralised because `user.lichess_name` used to be safe to read directly and
 * now is not — an email-only account has none, and every call site that assumed
 * otherwise would render "undefined" or crash.
 */
export function displayName(user: UserRecord): string {
  if (user.lichess_name) return user.lichess_name;
  if (user.email) return user.email.split("@")[0];
  return "Account";
}

/** How a session was opened. Surfaced to the user in the session list. */
export type AuthMethod = "lichess" | "password";

export type SessionRow = {
  id: string;
  user_id: string;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  auth_method: AuthMethod;
  user_agent: string | null;
  ip_hash: string | null;
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
    const seenAt = nowIso();
    await db.run("UPDATE users SET last_seen_at = ?, lichess_name = ? WHERE id = ?", [
      seenAt,
      lichessName,
      existing.id,
    ]);
    return { ...existing, lichess_name: lichessName, last_seen_at: seenAt };
  }

  const createdAt = nowIso();
  const id = crypto.randomUUID();
  await db.run(
    `INSERT INTO users (id, lichess_id, lichess_name, created_at, last_seen_at, plan)
     VALUES (?, ?, ?, ?, ?, 'free')`,
    [id, lichessId, lichessName, createdAt, createdAt],
  );
  return requireUserRow(db, id);
}

export function getUser(db: Db, userId: string): Promise<UserRecord | null> {
  return db.first<UserRecord>("SELECT * FROM users WHERE id = ?", [userId]);
}

export function getUserByLichessId(db: Db, lichessId: string): Promise<UserRecord | null> {
  return db.first<UserRecord>("SELECT * FROM users WHERE lichess_id = ?", [
    lichessId.toLowerCase(),
  ]);
}

/**
 * Re-read a row we just wrote, rather than assembling the object in TypeScript.
 *
 * Hand-built return values drift from the schema silently: every column with a
 * SQL default is one the literal has to duplicate, and nothing fails when it
 * stops matching. Reading back costs one query on a path that runs once per
 * account.
 */
async function requireUserRow(db: Db, userId: string): Promise<UserRecord> {
  const row = await getUser(db, userId);
  if (!row) throw new Error(`User ${userId} vanished immediately after being written`);
  return row;
}

// ---------------------------------------------------------------- password auth

export class EmailTakenError extends Error {
  constructor() {
    super("An account with that email already exists");
    this.name = "EmailTakenError";
  }
}

/**
 * Look up by email.
 *
 * The caller is responsible for having normalized the address — but so is this
 * function, because "the caller normalizes" is a convention and conventions are
 * how two rows for `Alice@x.com` and `alice@x.com` end up in a UNIQUE column
 * that was supposed to prevent exactly that.
 */
export function getUserByEmail(db: Db, email: string): Promise<UserRecord | null> {
  return db.first<UserRecord>("SELECT * FROM users WHERE email = ?", [email.trim().toLowerCase()]);
}

/**
 * Create an email+password account.
 *
 * Takes an already-hashed password. Hashing is not this layer's job, and a
 * repository that accepted a plaintext password would be one refactor away from
 * storing it.
 */
export async function createUserWithPassword(
  db: Db,
  email: string,
  passwordHash: string,
): Promise<UserRecord> {
  const normalized = email.trim().toLowerCase();
  const createdAt = nowIso();
  const id = crypto.randomUUID();

  try {
    await db.run(
      `INSERT INTO users (id, email, password_hash, created_at, last_seen_at, plan)
       VALUES (?, ?, ?, ?, ?, 'free')`,
      [id, normalized, passwordHash, createdAt, createdAt],
    );
  } catch (error) {
    // The UNIQUE index is the authority on whether an address is taken, not a
    // prior SELECT — between that SELECT and this INSERT, another request can
    // claim it. Translating the constraint violation is what makes the check
    // race-free.
    if (isUniqueViolation(error)) throw new EmailTakenError();
    throw error;
  }

  return requireUserRow(db, id);
}

export async function updatePasswordHash(
  db: Db,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await db.run("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, userId]);
}

/**
 * Attach a Lichess identity to an account that already exists.
 *
 * This is what makes "I signed up with email, now connect my Lichess" work
 * without creating a second account holding half the user's games.
 */
export async function linkLichessAccount(
  db: Db,
  userId: string,
  lichessId: string,
  lichessName: string,
): Promise<UserRecord> {
  try {
    await db.run(
      "UPDATE users SET lichess_id = ?, lichess_name = ?, last_seen_at = ? WHERE id = ?",
      [lichessId, lichessName, nowIso(), userId],
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw new LichessAlreadyLinkedError();
    throw error;
  }
  return requireUserRow(db, userId);
}

export class LichessAlreadyLinkedError extends Error {
  constructor() {
    super("That Lichess account is already connected to a different account");
    this.name = "LichessAlreadyLinkedError";
  }
}

/**
 * Both backends report a UNIQUE violation as a message, not a code we can
 * switch on — node:sqlite raises `SQLITE_CONSTRAINT_UNIQUE`, D1 wraps SQLite's
 * text. Matching on the message is unlovely but it is what is actually on offer.
 */
function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed/i.test(message);
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

export type SessionContext = {
  /** How the session was opened. Recorded so the user can see it later. */
  authMethod?: AuthMethod;
  /** Raw User-Agent header; truncated on the way in. */
  userAgent?: string | null;
  /** Client IP. Hashed here — the plaintext address is never stored. */
  ip?: string | null;
  /** Lifetime in days. Negative values create an already-expired session (tests). */
  ttlDays?: number;
};

/**
 * The session id is 256 bits from the CSPRNG, not a UUIDv4.
 *
 * A v4 UUID carries 122 bits of entropy and spends the rest on version and
 * variant bits — fine for a primary key, needlessly close to the line for a
 * bearer credential that is, on its own, sufficient to act as the user. This is
 * the one identifier in the schema where guessability is the entire threat.
 */
function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSession(
  db: Db,
  userId: string,
  context: SessionContext = {},
): Promise<{ id: string; expiresAt: string }> {
  const ttlDays = context.ttlDays ?? 30;
  const id = newSessionId();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000).toISOString();

  await db.run(
    `INSERT INTO sessions (id, user_id, created_at, expires_at, last_used_at, auth_method, user_agent, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      createdAt,
      expiresAt,
      createdAt,
      context.authMethod ?? "lichess",
      // Truncated: we want it recognisable in a list, not a complete
      // fingerprint, and UA strings are long enough to bloat every row.
      context.userAgent?.slice(0, 255) ?? null,
      context.ip ? await hashIp(context.ip) : null,
    ],
  );
  return { id, expiresAt };
}

/**
 * SHA-256 of the address.
 *
 * Storing the IP itself would turn the session table into a location history —
 * personal data we would then have to disclose, defend, and delete on request
 * (NFR-PR2). The hash still answers the only question the feature asks: is this
 * the same network as the session above it?
 */
async function hashIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest).slice(0, 8), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Resolve a session to its user, returning `last_used_at` alongside.
 *
 * The extra column rides along on a query we were making anyway, so the caller
 * can decide whether a "last used" write is due without a second read. That is
 * what keeps the touch below genuinely once-a-day rather than a no-op UPDATE
 * issued on every single page view.
 */
export async function getSessionWithUser(
  db: Db,
  sessionId: string,
): Promise<{ user: UserRecord; lastUsedAt: string | null } | null> {
  const row = await db.first<UserRecord & { __last_used_at: string | null }>(
    `SELECT u.*, s.last_used_at AS __last_used_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?`,
    [sessionId, nowIso()],
  );
  if (!row) return null;
  const { __last_used_at: lastUsedAt, ...user } = row;
  return { user, lastUsedAt };
}

export async function getSessionUser(db: Db, sessionId: string): Promise<UserRecord | null> {
  return (await getSessionWithUser(db, sessionId))?.user ?? null;
}

/**
 * Record activity.
 *
 * The `last_used_at` predicate makes a concurrent double-touch harmless, but
 * callers are still expected to check staleness first — this is a write, and
 * putting one on every page view to update a field read only in a settings list
 * is a poor trade on a per-write-billed database.
 */
export async function touchSession(db: Db, sessionId: string): Promise<void> {
  const now = nowIso();
  await db.run(
    "UPDATE sessions SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)",
    [now, sessionId, now.slice(0, 10)],
  );
}

/** Whether `last_used_at` is stale enough to be worth a write (once per UTC day). */
export function needsTouch(lastUsedAt: string | null): boolean {
  return !lastUsedAt || lastUsedAt.slice(0, 10) < nowIso().slice(0, 10);
}

/** Sessions for the account, newest first (US-A4). */
export function listSessions(db: Db, userId: string): Promise<SessionRow[]> {
  return db.all<SessionRow>(
    "SELECT * FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC",
    [userId, nowIso()],
  );
}

export async function deleteSession(db: Db, sessionId: string): Promise<void> {
  await db.run("DELETE FROM sessions WHERE id = ?", [sessionId]);
}

/**
 * Revoke one session, scoped to its owner.
 *
 * `user_id` is in the predicate, not checked by the caller. Session ids are
 * unguessable, but "unguessable" is not an authorization model — without this,
 * a leaked id from any source would let one account sign out another.
 */
export async function deleteUserSession(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const existing = await db.first<{ id: string }>(
    "SELECT id FROM sessions WHERE id = ? AND user_id = ?",
    [sessionId, userId],
  );
  if (!existing) return false;
  await db.run("DELETE FROM sessions WHERE id = ? AND user_id = ?", [sessionId, userId]);
  return true;
}

/**
 * Sign out everywhere else, keeping the caller's own session.
 *
 * This is the action a user takes when they think they have been compromised,
 * so it must not also sign *them* out — being thrown back to a login screen at
 * that moment is how people give up halfway through securing their account.
 */
export async function deleteOtherSessions(
  db: Db,
  userId: string,
  keepSessionId: string,
): Promise<void> {
  await db.run("DELETE FROM sessions WHERE user_id = ? AND id != ?", [userId, keepSessionId]);
}

/** Revoke every session for a user — used when the password changes. */
export async function deleteAllSessions(db: Db, userId: string): Promise<void> {
  await db.run("DELETE FROM sessions WHERE user_id = ?", [userId]);
}

/** Housekeeping: expired sessions, PKCE states and throttles are not worth retaining. */
export async function purgeExpired(db: Db): Promise<void> {
  const now = nowIso();
  await db.run("DELETE FROM sessions WHERE expires_at <= ?", [now]);
  await db.run("DELETE FROM oauth_states WHERE expires_at <= ?", [now]);
  await db.run("DELETE FROM auth_throttle WHERE expires_at <= ?", [Date.now()]);
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
