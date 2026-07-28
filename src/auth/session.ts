import { cookies, headers } from "next/headers";
import type { Db } from "@/db/client";
import { getSessionWithUser, needsTouch, touchSession, type UserRecord } from "@/db/repositories";

/**
 * Session cookie handling (US-A2, NFR-S1).
 *
 * The cookie carries an **opaque session id**, never a user id and never a
 * token. That is the whole design: possessing the cookie proves nothing except
 * that a server-side session row exists, so revoking is a DELETE and cannot be
 * out-run by a still-valid signed payload the way a stateless JWT can.
 *
 * Flags: `httpOnly` (script cannot read it), `secure` on any non-loopback
 * request (see `isSecureRequest`), `sameSite=lax` (survives the OAuth redirect
 * back from Lichess, which a `strict` cookie would not).
 */

export const SESSION_COOKIE = "ccai_session";
export const SESSION_TTL_DAYS = 30;

export type SessionCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge?: number;
  expires?: Date;
};

/**
 * Whether this request arrived over TLS.
 *
 * The question the `Secure` flag actually asks is "is the connection
 * encrypted?", and `NODE_ENV` is a poor proxy for it. A production build served
 * over plain HTTP — which is exactly what `next start` on 127.0.0.1 is, in
 * local runs and in the E2E suite — would be marked `Secure`, and the cookie
 * then travels for browsers (loopback counts as a trustworthy origin) but not
 * for HTTP clients that apply the rule literally. The result is a session that
 * works when you click and fails when you fetch, which is a miserable thing to
 * debug.
 *
 * Fails **closed**: anything that is not plainly loopback is treated as TLS, so
 * a proxy that forgets `X-Forwarded-Proto` can never downgrade a real
 * deployment.
 */
export async function isSecureRequest(): Promise<boolean> {
  const headerStore = await headers();

  const forwarded = headerStore.get("x-forwarded-proto");
  // May be a comma-separated chain; the first entry is the original client.
  if (forwarded) return forwarded.split(",")[0].trim().toLowerCase() === "https";

  const hostname = (headerStore.get("host") ?? "").split(":")[0].toLowerCase();
  const isLoopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

  return !isLoopback;
}

export function sessionCookieOptions(secure: boolean, expiresAt?: string): SessionCookieOptions {
  return {
    httpOnly: true,
    secure,
    // `lax`, not `strict`: the OAuth callback is a cross-site redirect back to
    // us, and a strict cookie would not be sent with it.
    sameSite: "lax",
    path: "/",
    ...(expiresAt ? { expires: new Date(expiresAt) } : {}),
  };
}

export async function setSessionCookie(sessionId: string, expiresAt: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, sessionId, sessionCookieOptions(await isSecureRequest(), expiresAt));
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(await isSecureRequest()),
    maxAge: 0,
  });
}

export async function readSessionId(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/** Current user, or null. Never throws — a bad cookie is simply "logged out". */
export async function currentUser(db: Db): Promise<UserRecord | null> {
  const sessionId = await readSessionId();
  if (!sessionId) return null;

  const resolved = await getSessionWithUser(db, sessionId);
  if (!resolved) return null;

  // Keep the session list honest about which devices are actually in use —
  // "last used 3 months ago" is what tells someone a session is safe to revoke.
  // Guarded so this is one write per session per day, not one per request.
  if (needsTouch(resolved.lastUsedAt)) {
    try {
      await touchSession(db, sessionId);
    } catch {
      // Bookkeeping. A failure here must never sign anyone out.
    }
  }

  return resolved.user;
}

/**
 * Guard for routes that require a signed-in user.
 *
 * Throws a typed error the route handler converts to a 401; this keeps the
 * check a single line at the top of each handler rather than a nested `if`
 * that is easy to omit.
 */
export class UnauthorizedError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "UnauthorizedError";
  }
}

export async function requireUser(db: Db): Promise<UserRecord> {
  const user = await currentUser(db);
  if (!user) throw new UnauthorizedError();
  return user;
}
