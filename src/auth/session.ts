import { cookies } from "next/headers";
import type { Db } from "@/db/client";
import { getSessionUser, type UserRecord } from "@/db/repositories";

/**
 * Session cookie handling (US-A2, NFR-S1).
 *
 * The cookie carries an **opaque session id**, never a user id and never a
 * token. That is the whole design: possessing the cookie proves nothing except
 * that a server-side session row exists, so revoking is a DELETE and cannot be
 * out-run by a still-valid signed payload the way a stateless JWT can.
 *
 * Flags: `httpOnly` (script cannot read it), `secure` outside development,
 * `sameSite=lax` (survives the OAuth redirect back from Lichess, which a
 * `strict` cookie would not).
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

export function sessionCookieOptions(expiresAt?: string): SessionCookieOptions {
  return {
    httpOnly: true,
    // Allow http on localhost so the flow is testable without a TLS proxy.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(expiresAt ? { expires: new Date(expiresAt) } : {}),
  };
}

export async function setSessionCookie(sessionId: string, expiresAt: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, sessionId, sessionCookieOptions(expiresAt));
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
}

export async function readSessionId(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/** Current user, or null. Never throws — a bad cookie is simply "logged out". */
export async function currentUser(db: Db): Promise<UserRecord | null> {
  const sessionId = await readSessionId();
  if (!sessionId) return null;
  return getSessionUser(db, sessionId);
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
