-- ChessCoach AI — initial schema (P1).
--
-- Target: Cloudflare D1 (SQLite). The same DDL runs against node:sqlite for
-- local development and tests, so there is exactly one dialect to reason about
-- and no ORM translating between them.
--
-- Conventions:
--   * Timestamps are ISO-8601 TEXT, not epoch integers — they are read in logs
--     and exports far more often than they are arithmetic'd, and SQLite has no
--     native date type either way.
--   * Every table a user owns cascades from `users`, so account deletion
--     (US-A4, NFR-PR3) is one DELETE rather than a checklist someone can forget
--     to update when a table is added.

-- ---------------------------------------------------------------- users
CREATE TABLE IF NOT EXISTS users (
  -- Our own id, so a platform account id is never a primary key we cannot change.
  id            TEXT PRIMARY KEY,
  -- Lichess user id (lowercased handle). Unique: one account per Lichess user (US-A2).
  lichess_id    TEXT NOT NULL UNIQUE,
  -- Display casing as Lichess shows it; matching is done on lichess_id.
  lichess_name  TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  -- Entitlement state (US-F3). 'free' | 'paid'. Server is the only writer.
  plan          TEXT NOT NULL DEFAULT 'free',
  plan_until    TEXT,
  -- Set when the user requests deletion; the row is purged by the job, but this
  -- makes the request itself auditable within the 30-day window (US-A4).
  deletion_requested_at TEXT
);

-- ---------------------------------------------------------------- oauth tokens
-- Separate from `users` because tokens are the most sensitive column in the
-- database and benefit from being trivially greppable, revocable, and dropped
-- without touching the account row.
CREATE TABLE IF NOT EXISTS oauth_tokens (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL DEFAULT 'lichess',
  -- AES-GCM ciphertext, base64. NEVER a plaintext token (NFR-S1).
  access_token_enc TEXT NOT NULL,
  -- Random per-record IV, base64.
  iv            TEXT NOT NULL,
  expires_at    TEXT,
  scopes        TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL
);

-- ---------------------------------------------------------------- sessions
CREATE TABLE IF NOT EXISTS sessions (
  -- Opaque random id; the cookie carries this, never a user id.
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Short-lived PKCE state. Rows are consumed on callback and swept by expiry;
-- storing them server-side means the verifier never rides in a cookie.
CREATE TABLE IF NOT EXISTS oauth_states (
  state         TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  redirect_to   TEXT,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);

-- ---------------------------------------------------------------- games
CREATE TABLE IF NOT EXISTS games (
  -- `${platform}:${game_id}` — matches gameKey() so the cache key and the
  -- primary key cannot drift.
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL,
  platform_game_id TEXT NOT NULL,
  played_at     TEXT NOT NULL,
  speed         TEXT NOT NULL,
  time_control  TEXT NOT NULL,
  rated         INTEGER NOT NULL DEFAULT 0,
  subject_color TEXT NOT NULL,
  subject_result TEXT NOT NULL,
  opponent_name TEXT,
  opponent_rating INTEGER,
  subject_rating  INTEGER,
  eco           TEXT,
  opening_name  TEXT,
  move_count    INTEGER NOT NULL DEFAULT 0,
  -- The full NormalizedGame as JSON. Denormalised on purpose: re-deriving a
  -- game from columns would mean a second source of truth for the same object.
  payload       TEXT NOT NULL,
  imported_at   TEXT NOT NULL,
  UNIQUE (user_id, platform, platform_game_id)
);
CREATE INDEX IF NOT EXISTS idx_games_user_played ON games(user_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_user_speed ON games(user_id, speed);
CREATE INDEX IF NOT EXISTS idx_games_user_color ON games(user_id, subject_color);
CREATE INDEX IF NOT EXISTS idx_games_user_result ON games(user_id, subject_result);

-- ---------------------------------------------------------------- reports
CREATE TABLE IF NOT EXISTS reports (
  id            TEXT PRIMARY KEY,
  game_id       TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- FR-3: analysis is idempotent per engine version; a new engine invalidates.
  engine_version TEXT NOT NULL,
  -- FR-4: the exact prompt and model that produced the prose, so a report can
  -- be reproduced and debugged.
  prompt_version TEXT,
  model         TEXT,
  summary_text  TEXT NOT NULL DEFAULT '',
  summary_status TEXT NOT NULL,
  accuracy      REAL,
  -- Classification counts + per-move data as JSON.
  classification TEXT NOT NULL,
  evals         TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  UNIQUE (game_id, engine_version)
);
CREATE INDEX IF NOT EXISTS idx_reports_user_created ON reports(user_id, created_at DESC);

-- ---------------------------------------------------------------- waitlist
-- Not user-owned (these people have no account), so it does not cascade.
-- Deletion is by address, per NFR-PR3.
CREATE TABLE IF NOT EXISTS waitlist (
  email         TEXT PRIMARY KEY,
  consented_at  TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'demo'
);
