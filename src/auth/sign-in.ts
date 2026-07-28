import type { Db } from "@/db/client";
import { createSession, type AuthMethod } from "@/db/repositories";
import { setSessionCookie } from "@/auth/session";
import { clientIdentifier } from "@/server/rate-limit";

/**
 * Opening a session, in one place (US-A2, NFR-S1).
 *
 * Three routes now sign a user in — OAuth callback, password sign-in, and
 * registration. Each one has to create the row, capture the same metadata, and
 * set the cookie with the same flags. Three copies of that is three chances for
 * one to quietly omit the `httpOnly` flag or forget to record the auth method,
 * and the omission would not fail any test that did not think to look for it.
 */
export async function openSession(
  db: Db,
  userId: string,
  request: Request,
  authMethod: AuthMethod,
): Promise<void> {
  const session = await createSession(db, userId, {
    authMethod,
    userAgent: request.headers.get("user-agent"),
    ip: clientIdentifier(request),
  });
  await setSessionCookie(session.id, session.expiresAt);
}

/**
 * Where to send the user after signing in.
 *
 * Only same-origin paths are honoured. An unvalidated `redirect_to` is an open
 * redirect: a phishing link would carry the user through a *genuine* sign-in on
 * our domain and then hand them to an attacker's page, with the trust of having
 * just authenticated for real.
 */
export function safeRedirect(target: string | null | undefined, fallback = "/games"): string {
  if (!target) return fallback;
  // Must be a root-relative path. `//evil.example` is protocol-relative and
  // resolves off-site despite starting with a slash, so it is rejected too.
  if (!target.startsWith("/") || target.startsWith("//")) return fallback;
  if (target.includes("\\")) return fallback;
  return target;
}
