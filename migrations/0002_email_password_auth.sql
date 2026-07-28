-- Email + password authentication, session metadata, and auth throttling.
--
-- This migration is NOT idempotent — it rebuilds `users`. It is applied exactly
-- once, tracked in `schema_migrations` (see src/db/index.ts). Running it twice
-- would copy the table with NULLs in the new columns and silently erase every
-- stored credential, which is precisely why the ledger was added alongside it.

-- ---------------------------------------------------------------- users
-- `lichess_id` has to become nullable: an account created with an email has no
-- Lichess identity, and may never acquire one. SQLite cannot drop a NOT NULL
-- constraint in place, so this is the documented 12-step table rebuild.
--
-- Foreign keys are disabled for the rebuild deliberately. With them ON, DROP
-- TABLE performs an implicit DELETE FROM, which would cascade through
-- oauth_tokens, sessions, games and reports and delete every user's data. The
-- rebuild is wrapped so that never happens.
PRAGMA foreign_keys = OFF;

CREATE TABLE users_rebuilt (
  id            TEXT PRIMARY KEY,

  -- Normalized (lowercased, trimmed) at every write and lookup, so a single
  -- address cannot occupy two rows. NULL for accounts that only ever used OAuth.
  email         TEXT UNIQUE,
  -- `pbkdf2-sha256$<iterations>$<salt>$<derived>`. NULL for OAuth-only accounts:
  -- a NULL here means "this account has no password", never "any password works",
  -- and the sign-in path checks for it explicitly.
  password_hash TEXT,
  -- Reserved for the verification flow. NULL is currently the norm — we do not
  -- yet send mail, and pretending otherwise in the schema would be a lie.
  email_verified_at TEXT,

  -- Now nullable, and no longer the only way to be a user.
  lichess_id    TEXT UNIQUE,
  lichess_name  TEXT,

  created_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'free',
  plan_until    TEXT,
  deletion_requested_at TEXT,

  -- Every account must retain at least one way to sign in. Without this, a
  -- future "disconnect Lichess" feature could strand an account nobody can ever
  -- reach again — enforced here because application code forgets.
  CHECK (email IS NOT NULL OR lichess_id IS NOT NULL),
  -- A password is meaningless without an address to sign in with.
  CHECK (password_hash IS NULL OR email IS NOT NULL),
  -- Matches the pairing in `users`: a Lichess link is both columns or neither.
  CHECK ((lichess_id IS NULL) = (lichess_name IS NULL))
);

INSERT INTO users_rebuilt (
  id, email, password_hash, email_verified_at,
  lichess_id, lichess_name, created_at, last_seen_at,
  plan, plan_until, deletion_requested_at
)
SELECT
  id, NULL, NULL, NULL,
  lichess_id, lichess_name, created_at, last_seen_at,
  plan, plan_until, deletion_requested_at
FROM users;

DROP TABLE users;
ALTER TABLE users_rebuilt RENAME TO users;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- sessions
-- Sessions were already server-side rows; what they lacked was any way for the
-- owner to see or manage them. These columns are what makes "signed in on 3
-- devices — sign out the one you don't recognise" possible (US-A4).
ALTER TABLE sessions ADD COLUMN last_used_at TEXT;
-- Which credential opened this session: 'lichess' | 'password'. Shown to the
-- user, and useful when reasoning about a compromise after the fact.
ALTER TABLE sessions ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'lichess';
-- Truncated UA string, for recognisability only ("Chrome on macOS"). Never
-- parsed for behaviour — a header the client controls must not gate access.
ALTER TABLE sessions ADD COLUMN user_agent TEXT;
-- SHA-256 of the client IP, not the IP. Enough to answer "was this the same
-- network as last time?" without turning the session table into a location log
-- we would then have to defend and disclose (NFR-PR2).
ALTER TABLE sessions ADD COLUMN ip_hash TEXT;

-- ---------------------------------------------------------------- throttling
-- Failed sign-in counters.
--
-- Deliberately in the database rather than the in-memory store: Workers isolates
-- are per-instance, so an in-memory counter gives an attacker a fresh allowance
-- with every isolate they happen to land on. That is not a degraded rate limit,
-- it is no rate limit at all.
CREATE TABLE IF NOT EXISTS auth_throttle (
  -- `<scope>:<window>:<identifier>` — identifier is an email or an IP.
  key           TEXT PRIMARY KEY,
  count         INTEGER NOT NULL DEFAULT 0,
  -- Epoch ms. Integer here because it is only ever compared, never displayed.
  expires_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_throttle_expires ON auth_throttle(expires_at);
