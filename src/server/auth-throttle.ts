import type { Db } from "@/db/client";

/**
 * Failed sign-in throttling (NFR-S1).
 *
 * ## Why this is not `MemoryRateLimitStore`
 *
 * That store's own comment says it is "correct for one process, wrong for a
 * fleet". For the demo-report quota, being wrong for a fleet means someone gets
 * a few extra reports. For password attempts it means an attacker gets a fresh
 * allowance from every Worker isolate they land on, which is indistinguishable
 * from having no throttle. So this one is backed by the database, where the
 * count is shared by definition.
 *
 * ## Two buckets, because there are two attacks
 *
 * Per-email catches someone grinding one account. Per-IP catches someone
 * spraying one common password across many accounts — an attack the per-email
 * counter never sees, because no single account accumulates failures.
 *
 * Windows are fixed, not sliding: the window starts at the first failure and
 * the counter resets when it ends. A sliding window would be marginally
 * stricter and needs per-attempt timestamps; this is one row per identifier.
 */

/** A determined human mistypes; 8 in 15 minutes is past that. */
export const LOGIN_MAX_ATTEMPTS_PER_EMAIL = 8;

/**
 * Higher, because a NATed office or university shares one address, and locking
 * out a building to slow one attacker is the wrong trade.
 */
export const LOGIN_MAX_ATTEMPTS_PER_IP = 40;

export const LOGIN_WINDOW_MS = 15 * 60_000;

/**
 * Account creation, per IP per hour — bounds automated signup floods.
 *
 * Generous for the same reason the login IP bucket is: a school, office or
 * household shares one address, and a family signing up together must not be
 * told to come back in an hour. This is a flood guard, not a quota.
 */
export const REGISTER_MAX_PER_IP = 20;
export const REGISTER_WINDOW_MS = 60 * 60_000;

export type ThrottleVerdict = {
  readonly allowed: boolean;
  /** Seconds until the caller may retry. 0 when allowed. */
  readonly retryAfterSeconds: number;
};

const ALLOWED: ThrottleVerdict = { allowed: true, retryAfterSeconds: 0 };

/**
 * Increment and return the new count for a fixed window.
 *
 * One statement, so the read-modify-write cannot interleave with a concurrent
 * attempt. Doing this as SELECT-then-UPDATE would let two simultaneous requests
 * both read `7`, both write `8`, and quietly hand an attacker an extra try —
 * which is exactly the shape of race that makes throttles leak under the load
 * an attacker generates by definition.
 */
async function bump(db: Db, key: string, windowMs: number, nowMs: number): Promise<number> {
  const expiresAt = nowMs + windowMs;
  const row = await db.first<{ count: number }>(
    `INSERT INTO auth_throttle (key, count, expires_at) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN auth_throttle.expires_at <= ? THEN 1 ELSE auth_throttle.count + 1 END,
       expires_at = CASE WHEN auth_throttle.expires_at <= ? THEN ? ELSE auth_throttle.expires_at END
     RETURNING count`,
    [key, expiresAt, nowMs, nowMs, expiresAt],
  );
  return row?.count ?? 1;
}

/** Current count without incrementing. Expired rows read as zero. */
async function peek(
  db: Db,
  key: string,
  nowMs: number,
): Promise<{ count: number; endsAt: number }> {
  const row = await db.first<{ count: number; expires_at: number }>(
    "SELECT count, expires_at FROM auth_throttle WHERE key = ?",
    [key],
  );
  if (!row || row.expires_at <= nowMs) return { count: 0, endsAt: nowMs };
  return { count: row.count, endsAt: row.expires_at };
}

async function clear(db: Db, key: string): Promise<void> {
  await db.run("DELETE FROM auth_throttle WHERE key = ?", [key]);
}

const emailKey = (email: string) => `login:email:${email}`;
const ipKey = (ip: string) => `login:ip:${ip}`;
const registerKey = (ip: string) => `register:ip:${ip}`;

/**
 * Check before attempting a sign-in.
 *
 * Read-only on purpose. If this incremented, a locked-out attacker would extend
 * their own lockout with every poll — which sounds appealing until you notice
 * it lets *anyone* keep a victim locked out indefinitely by hammering their
 * address. Only genuine failures count, via `recordLoginFailure`.
 */
export async function checkLoginAllowed(
  db: Db,
  identity: { email: string; ip: string },
  nowMs: number = Date.now(),
): Promise<ThrottleVerdict> {
  const [byEmail, byIp] = await Promise.all([
    peek(db, emailKey(identity.email), nowMs),
    peek(db, ipKey(identity.ip), nowMs),
  ]);

  const blocked =
    (byEmail.count >= LOGIN_MAX_ATTEMPTS_PER_EMAIL ? byEmail.endsAt : 0) ||
    (byIp.count >= LOGIN_MAX_ATTEMPTS_PER_IP ? byIp.endsAt : 0);

  if (!blocked) return ALLOWED;
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((blocked - nowMs) / 1000)) };
}

export async function recordLoginFailure(
  db: Db,
  identity: { email: string; ip: string },
  nowMs: number = Date.now(),
): Promise<void> {
  await Promise.all([
    bump(db, emailKey(identity.email), LOGIN_WINDOW_MS, nowMs),
    bump(db, ipKey(identity.ip), LOGIN_WINDOW_MS, nowMs),
  ]);
}

/**
 * Clear on success.
 *
 * Only the email bucket. The IP bucket survives deliberately: an attacker
 * spraying from one address will eventually hit a correct password, and
 * resetting their IP allowance at that moment would reward the one attempt we
 * most want to have slowed down.
 */
export async function clearLoginFailures(db: Db, email: string): Promise<void> {
  await clear(db, emailKey(email));
}

export async function checkRegisterAllowed(
  db: Db,
  ip: string,
  nowMs: number = Date.now(),
): Promise<ThrottleVerdict> {
  const count = await bump(db, registerKey(ip), REGISTER_WINDOW_MS, nowMs);
  if (count <= REGISTER_MAX_PER_IP) return ALLOWED;
  const { endsAt } = await peek(db, registerKey(ip), nowMs);
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((endsAt - nowMs) / 1000)) };
}

/** Housekeeping — expired counters are not worth retaining. */
export async function purgeExpiredThrottles(db: Db, nowMs: number = Date.now()): Promise<void> {
  await db.run("DELETE FROM auth_throttle WHERE expires_at <= ?", [nowMs]);
}
