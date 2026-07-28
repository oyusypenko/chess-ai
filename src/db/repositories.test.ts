import { describe, it, expect, beforeEach } from "vitest";
import { sqliteDb, type Db } from "./client";
import { migrate } from "./index";
import {
  upsertUserByLichessId,
  saveAccessToken,
  readAccessToken,
  deleteAccessToken,
  createSession,
  getSessionUser,
  deleteSession,
  saveOAuthState,
  consumeOAuthState,
  saveGame,
  listGames,
  getGame,
  saveReport,
  getReport,
  deleteUser,
  purgeExpired,
  createUserWithPassword,
  getUserByEmail,
  getUser,
  updatePasswordHash,
  linkLichessAccount,
  listSessions,
  deleteUserSession,
  deleteOtherSessions,
  touchSession,
  needsTouch,
  EmailTakenError,
  LichessAlreadyLinkedError,
} from "./repositories";
import { generateKeyBase64, encryptToken, decryptToken } from "./crypto";
import type { NormalizedGame } from "@/model/game";

const KEY = generateKeyBase64();

let db: Db;
beforeEach(async () => {
  db = await sqliteDb(":memory:");
  // The real migration runner, not a hand-picked schema file. Tests that build
  // their own schema stop testing the one that ships the moment a migration is
  // added — and `0002` rebuilds `users`, so that divergence would have been
  // invisible right up until production.
  await migrate(db);
});

function game(overrides: Partial<NormalizedGame> = {}): NormalizedGame {
  return {
    id: "abc",
    platform: "lichess",
    url: "https://lichess.org/abc",
    playedAt: "2026-03-01T10:00:00.000Z",
    speed: "blitz",
    timeControl: { kind: "clock", initialSeconds: 300, incrementSeconds: 0 },
    rated: true,
    players: {
      white: { username: "me", rating: 1500, ratingDiff: 5, isBot: false },
      black: { username: "them", rating: 1480, ratingDiff: -5, isBot: false },
    },
    subject: { username: "me", color: "white", result: "win" },
    status: "mate",
    winner: "white",
    opening: { eco: "C50", name: "Italian Game" },
    initialFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    moves: [],
    finished: true,
    ...overrides,
  };
}

describe("users", () => {
  it("creates on first login and reuses on the next", async () => {
    const first = await upsertUserByLichessId(db, "player", "Player");
    const second = await upsertUserByLichessId(db, "player", "Player");
    // One account per Lichess user (US-A2) — a second login must not fork it.
    expect(second.id).toBe(first.id);
  });

  it("updates display casing without changing identity", async () => {
    const user = await upsertUserByLichessId(db, "player", "player");
    const renamed = await upsertUserByLichessId(db, "player", "PlayeR");
    expect(renamed.id).toBe(user.id);
    expect(renamed.lichess_name).toBe("PlayeR");
  });

  it("defaults to the free plan", async () => {
    expect((await upsertUserByLichessId(db, "p", "P")).plan).toBe("free");
  });
});

describe("token encryption (US-A2, NFR-S1)", () => {
  it("round-trips a token", async () => {
    const enc = await encryptToken("lio_secret", KEY);
    expect(await decryptToken(enc, KEY)).toBe("lio_secret");
  });

  it("never stores the plaintext token in the database", async () => {
    const user = await upsertUserByLichessId(db, "p", "P");
    await saveAccessToken(db, user.id, "lio_supersecret", KEY);

    const raw = await db.first<{ access_token_enc: string }>(
      "SELECT access_token_enc FROM oauth_tokens WHERE user_id = ?",
      [user.id],
    );
    // The assertion that matters: a database dump must not contain the token.
    expect(raw?.access_token_enc).not.toContain("lio_supersecret");
    expect(await readAccessToken(db, user.id, KEY)).toBe("lio_supersecret");
  });

  it("uses a distinct IV per record so identical tokens differ on disk", async () => {
    const a = await encryptToken("same", KEY);
    const b = await encryptToken("same", KEY);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("returns null rather than throwing when the key no longer decrypts", async () => {
    const user = await upsertUserByLichessId(db, "p", "P");
    await saveAccessToken(db, user.id, "tok", KEY);
    // Key rotated: the user should be asked to re-auth, not shown a crash.
    expect(await readAccessToken(db, user.id, generateKeyBase64())).toBeNull();
  });

  it("replaces the token on re-login rather than accumulating rows", async () => {
    const user = await upsertUserByLichessId(db, "p", "P");
    await saveAccessToken(db, user.id, "first", KEY);
    await saveAccessToken(db, user.id, "second", KEY);
    expect(await readAccessToken(db, user.id, KEY)).toBe("second");
  });

  it("drops the token on revocation", async () => {
    const user = await upsertUserByLichessId(db, "p", "P");
    await saveAccessToken(db, user.id, "tok", KEY);
    await deleteAccessToken(db, user.id);
    expect(await readAccessToken(db, user.id, KEY)).toBeNull();
  });
});

describe("sessions", () => {
  it("resolves a live session to its user", async () => {
    const user = await upsertUserByLichessId(db, "p", "P");
    const session = await createSession(db, user.id);
    expect((await getSessionUser(db, session.id))?.id).toBe(user.id);
  });

  it("refuses an expired session", async () => {
    const user = await upsertUserByLichessId(db, "p", "P");
    const session = await createSession(db, user.id, { ttlDays: -1 }); // already expired
    expect(await getSessionUser(db, session.id)).toBeNull();
  });

  it("refuses an unknown session id", async () => {
    expect(await getSessionUser(db, "nope")).toBeNull();
  });

  it("logout invalidates immediately", async () => {
    const user = await upsertUserByLichessId(db, "p", "P");
    const session = await createSession(db, user.id);
    await deleteSession(db, session.id);
    expect(await getSessionUser(db, session.id)).toBeNull();
  });

  it("purges expired sessions", async () => {
    const user = await upsertUserByLichessId(db, "p", "P");
    await createSession(db, user.id, { ttlDays: -1 });
    await purgeExpired(db);
    expect(await db.all("SELECT * FROM sessions")).toHaveLength(0);
  });
});

describe("oauth state (PKCE)", () => {
  it("round-trips the verifier", async () => {
    await saveOAuthState(db, "state123", "verifier456", "/dashboard");
    const consumed = await consumeOAuthState(db, "state123");
    expect(consumed).toMatchObject({ code_verifier: "verifier456", redirect_to: "/dashboard" });
  });

  it("is SINGLE USE — a replayed callback finds nothing", async () => {
    await saveOAuthState(db, "s", "v", null);
    expect(await consumeOAuthState(db, "s")).not.toBeNull();
    expect(await consumeOAuthState(db, "s")).toBeNull();
  });

  it("rejects an expired state", async () => {
    await saveOAuthState(db, "s", "v", null, -1);
    expect(await consumeOAuthState(db, "s")).toBeNull();
  });

  it("returns null for an unknown state", async () => {
    expect(await consumeOAuthState(db, "never-issued")).toBeNull();
  });
});

describe("games", () => {
  it("saves and lists newest first", async () => {
    const user = await upsertUserByLichessId(db, "me", "me");
    await saveGame(db, user.id, game({ id: "old", playedAt: "2026-01-01T00:00:00.000Z" }));
    await saveGame(db, user.id, game({ id: "new", playedAt: "2026-06-01T00:00:00.000Z" }));

    const rows = await listGames(db, user.id);
    expect(rows.map((r) => r.platform_game_id)).toEqual(["new", "old"]);
  });

  it("is idempotent on re-import", async () => {
    const user = await upsertUserByLichessId(db, "me", "me");
    await saveGame(db, user.id, game());
    await saveGame(db, user.id, game());
    expect(await listGames(db, user.id)).toHaveLength(1);
  });

  it("filters by speed, colour and result (US-B3)", async () => {
    const user = await upsertUserByLichessId(db, "me", "me");
    await saveGame(db, user.id, game({ id: "a", speed: "blitz" }));
    await saveGame(
      db,
      user.id,
      game({
        id: "b",
        speed: "rapid",
        subject: { username: "me", color: "black", result: "loss" },
      }),
    );

    expect(await listGames(db, user.id, { speed: "blitz" })).toHaveLength(1);
    expect(await listGames(db, user.id, { color: "black" })).toHaveLength(1);
    expect(await listGames(db, user.id, { result: "loss" })).toHaveLength(1);
    expect(await listGames(db, user.id, { speed: "bullet" })).toHaveLength(0);
  });

  it("reports the analyzed badge without an N+1 (US-B1)", async () => {
    const user = await upsertUserByLichessId(db, "me", "me");
    const id = await saveGame(db, user.id, game());
    expect((await listGames(db, user.id))[0].analyzed).toBe(0);

    await saveReport(db, {
      game_id: id,
      user_id: user.id,
      engine_version: "v1",
      prompt_version: "p1",
      model: "m",
      summary_text: "ok",
      summary_status: "ok",
      accuracy: 90,
      classification: "{}",
      evals: "{}",
    });
    expect((await listGames(db, user.id))[0].analyzed).toBe(1);
  });

  it("does not leak another user's game", async () => {
    const me = await upsertUserByLichessId(db, "me", "me");
    const you = await upsertUserByLichessId(db, "you", "you");
    const id = await saveGame(db, me.id, game());
    // Ownership is enforced in the query, not by a caller remembering to check.
    expect(await getGame(db, you.id, id)).toBeNull();
    expect(await getGame(db, me.id, id)).not.toBeNull();
  });
});

describe("reports (FR-3, FR-4)", () => {
  it("stores prompt and model version for reproducibility", async () => {
    const user = await upsertUserByLichessId(db, "me", "me");
    const gameId = await saveGame(db, user.id, game());
    await saveReport(db, {
      game_id: gameId,
      user_id: user.id,
      engine_version: "sf18-v1",
      prompt_version: "report-v1",
      model: "claude-haiku-4-5",
      summary_text: "text",
      summary_status: "ok",
      accuracy: 88.5,
      classification: "{}",
      evals: "{}",
    });
    const report = await getReport(db, user.id, gameId);
    expect(report).toMatchObject({ prompt_version: "report-v1", model: "claude-haiku-4-5" });
  });

  it("is idempotent per (game, engine version)", async () => {
    const user = await upsertUserByLichessId(db, "me", "me");
    const gameId = await saveGame(db, user.id, game());
    const base = {
      game_id: gameId,
      user_id: user.id,
      engine_version: "v1",
      prompt_version: "p",
      model: "m",
      summary_status: "ok",
      accuracy: 1,
      classification: "{}",
      evals: "{}",
    };
    await saveReport(db, { ...base, summary_text: "first" });
    await saveReport(db, { ...base, summary_text: "second" });

    expect(await db.all("SELECT * FROM reports")).toHaveLength(1);
    expect((await getReport(db, user.id, gameId))?.summary_text).toBe("second");
  });

  it("keeps separate rows per engine version so an upgrade re-analyzes", async () => {
    const user = await upsertUserByLichessId(db, "me", "me");
    const gameId = await saveGame(db, user.id, game());
    const base = {
      game_id: gameId,
      user_id: user.id,
      prompt_version: "p",
      model: "m",
      summary_text: "t",
      summary_status: "ok",
      accuracy: 1,
      classification: "{}",
      evals: "{}",
    };
    await saveReport(db, { ...base, engine_version: "v1" });
    await saveReport(db, { ...base, engine_version: "v2" });
    expect(await db.all("SELECT * FROM reports")).toHaveLength(2);
  });
});

describe("account deletion (US-A4, NFR-PR3)", () => {
  it("removes the user and everything that cascades from them", async () => {
    const user = await upsertUserByLichessId(db, "me", "me");
    await saveAccessToken(db, user.id, "tok", KEY);
    await createSession(db, user.id);
    const gameId = await saveGame(db, user.id, game());
    await saveReport(db, {
      game_id: gameId,
      user_id: user.id,
      engine_version: "v1",
      prompt_version: "p",
      model: "m",
      summary_text: "t",
      summary_status: "ok",
      accuracy: 1,
      classification: "{}",
      evals: "{}",
    });

    await deleteUser(db, user.id);

    // Nothing may survive — a leftover token or report is a GDPR failure, not
    // an untidy table.
    for (const table of ["users", "oauth_tokens", "sessions", "games", "reports"]) {
      expect(await db.all(`SELECT * FROM ${table}`), `${table} not cleared`).toHaveLength(0);
    }
  });
});

describe("email + password accounts (US-A2)", () => {
  const HASH = "pbkdf2-sha256$600000$c2FsdA==$ZGVyaXZlZA==";

  it("creates an account with no Lichess identity at all", async () => {
    const user = await createUserWithPassword(db, "player@example.com", HASH);
    expect(user.email).toBe("player@example.com");
    expect(user.lichess_id).toBeNull();
    expect(user.lichess_name).toBeNull();
  });

  it("normalizes the address on write and on lookup", async () => {
    await createUserWithPassword(db, "  Player@Example.COM ", HASH);
    // Both spellings must find the one row, or the UNIQUE index protects nothing.
    expect(await getUserByEmail(db, "player@example.com")).not.toBeNull();
    expect(await getUserByEmail(db, "PLAYER@EXAMPLE.com")).not.toBeNull();
  });

  it("refuses a duplicate address", async () => {
    await createUserWithPassword(db, "player@example.com", HASH);
    await expect(createUserWithPassword(db, "PLAYER@example.com", HASH)).rejects.toThrow(
      EmailTakenError,
    );
  });

  it("returns null for an unknown address", async () => {
    expect(await getUserByEmail(db, "nobody@example.com")).toBeNull();
  });

  it("links a Lichess account to an existing email account", async () => {
    // The alternative — creating a second user — silently splits someone's
    // history across two accounts.
    const user = await createUserWithPassword(db, "player@example.com", HASH);
    const linked = await linkLichessAccount(db, user.id, "player", "Player");
    expect(linked.id).toBe(user.id);
    expect(linked.lichess_name).toBe("Player");
    expect(linked.email).toBe("player@example.com");
  });

  it("refuses to link a Lichess account already attached elsewhere", async () => {
    await upsertUserByLichessId(db, "player", "Player");
    const other = await createUserWithPassword(db, "other@example.com", HASH);
    await expect(linkLichessAccount(db, other.id, "player", "Player")).rejects.toThrow(
      LichessAlreadyLinkedError,
    );
  });

  it("keeps an OAuth-only account free of a password hash", async () => {
    const user = await upsertUserByLichessId(db, "player", "Player");
    expect(user.password_hash).toBeNull();
    expect(user.email).toBeNull();
  });

  it("replaces the hash on change", async () => {
    const user = await createUserWithPassword(db, "player@example.com", HASH);
    await updatePasswordHash(db, user.id, "pbkdf2-sha256$600000$bmV3$bmV3");
    expect((await getUser(db, user.id))?.password_hash).toBe("pbkdf2-sha256$600000$bmV3$bmV3");
  });

  it("cascades deletion for a password account exactly as for an OAuth one", async () => {
    const user = await createUserWithPassword(db, "player@example.com", HASH);
    await createSession(db, user.id);
    await saveGame(db, user.id, game());

    await deleteUser(db, user.id);

    expect(await db.all("SELECT * FROM sessions")).toHaveLength(0);
    expect(await db.all("SELECT * FROM games")).toHaveLength(0);
  });
});

describe("schema constraints", () => {
  it("refuses an account with neither an email nor a Lichess id", async () => {
    // The CHECK is the backstop for a future "disconnect Lichess" feature
    // stranding an account nobody can sign in to.
    await expect(
      db.run("INSERT INTO users (id, created_at, last_seen_at) VALUES ('x', 'now', 'now')"),
    ).rejects.toThrow();
  });

  it("refuses a password hash without an email to sign in with", async () => {
    await expect(
      db.run(
        "INSERT INTO users (id, lichess_id, lichess_name, password_hash, created_at, last_seen_at) VALUES ('x', 'l', 'L', 'h', 'now', 'now')",
      ),
    ).rejects.toThrow();
  });
});

describe("session management (US-A4)", () => {
  it("records how the session was opened", async () => {
    const user = await upsertUserByLichessId(db, "p", "P");
    const session = await createSession(db, user.id, { authMethod: "password" });
    const rows = await listSessions(db, user.id);
    expect(rows.find((r) => r.id === session.id)?.auth_method).toBe("password");
  });

  it("stores a hash of the IP, never the address itself", async () => {
    const user = await upsertUserByLichessId(db, "p", "P");
    await createSession(db, user.id, { ip: "203.0.113.7" });
    const [row] = await listSessions(db, user.id);
    // A session table full of plaintext IPs is a location log we would have to
    // defend and disclose.
    expect(row.ip_hash).not.toContain("203.0.113.7");
    expect(row.ip_hash).toMatch(/^[0-9a-f]+$/);
  });

  it("truncates an absurd user-agent instead of storing it whole", async () => {
    const user = await upsertUserByLichessId(db, "p", "P");
    await createSession(db, user.id, { userAgent: "U".repeat(5000) });
    const [row] = await listSessions(db, user.id);
    expect(row.user_agent!.length).toBeLessThanOrEqual(255);
  });

  it("uses an unguessable session id", async () => {
    const user = await upsertUserByLichessId(db, "p", "P");
    const session = await createSession(db, user.id);
    // 32 bytes hex. This value is a bearer credential on its own.
    expect(session.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("lists only live sessions", async () => {
    const user = await upsertUserByLichessId(db, "p", "P");
    await createSession(db, user.id);
    await createSession(db, user.id, { ttlDays: -1 });
    expect(await listSessions(db, user.id)).toHaveLength(1);
  });

  it("revokes one session and leaves the others alone", async () => {
    const user = await upsertUserByLichessId(db, "p", "P");
    const keep = await createSession(db, user.id);
    const drop = await createSession(db, user.id);

    expect(await deleteUserSession(db, user.id, drop.id)).toBe(true);
    expect(await getSessionUser(db, drop.id)).toBeNull();
    expect(await getSessionUser(db, keep.id)).not.toBeNull();
  });

  it("will not let one account revoke another's session", async () => {
    // Session ids are unguessable, but "unguessable" is not an authorization
    // model.
    const mine = await upsertUserByLichessId(db, "mine", "Mine");
    const theirs = await upsertUserByLichessId(db, "theirs", "Theirs");
    const victim = await createSession(db, theirs.id);

    expect(await deleteUserSession(db, mine.id, victim.id)).toBe(false);
    expect(await getSessionUser(db, victim.id)).not.toBeNull();
  });

  it("signs out everywhere else while keeping the current session", async () => {
    const user = await upsertUserByLichessId(db, "p", "P");
    const current = await createSession(db, user.id);
    const other = await createSession(db, user.id);

    await deleteOtherSessions(db, user.id, current.id);

    // Signing the user out mid-way through securing their account is how they
    // abandon it half-done.
    expect(await getSessionUser(db, current.id)).not.toBeNull();
    expect(await getSessionUser(db, other.id)).toBeNull();
  });

  it("touches last_used_at at most once a day", async () => {
    const user = await upsertUserByLichessId(db, "p", "P");
    const session = await createSession(db, user.id);

    const before = (await listSessions(db, user.id))[0].last_used_at;
    expect(needsTouch(before)).toBe(false); // just created, today
    expect(needsTouch(null)).toBe(true);
    expect(needsTouch("2020-01-01T00:00:00.000Z")).toBe(true);

    await touchSession(db, session.id);
    expect((await listSessions(db, user.id))[0].last_used_at).not.toBeNull();
  });
});
