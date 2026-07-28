import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { deleteOtherSessions, updatePasswordHash } from "@/db/repositories";
import { hashPassword, validatePassword, verifyPassword } from "@/auth/password";
import { readSessionId, requireUser, UnauthorizedError } from "@/auth/session";
import { checkLoginAllowed, recordLoginFailure } from "@/server/auth-throttle";
import { clientIdentifier } from "@/server/rate-limit";

/**
 * `POST /api/account/password` — set or change the password (US-A2).
 *
 * Serves two cases with one handler:
 *   * **Change** — the account has a password; the current one is required.
 *   * **Set** — an OAuth-only account adds a password. There is nothing to
 *     verify, because the live session already proves control of the account.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const db = await getDb();

  let user;
  try {
    user = await requireUser(db);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, message: "Sign in first." }, { status: 401 });
    }
    throw error;
  }

  let body: { current_password?: unknown; new_password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  const newPassword = typeof body.new_password === "string" ? body.new_password : "";
  const currentPassword = typeof body.current_password === "string" ? body.current_password : "";

  if (user.password_hash) {
    // Throttled like a sign-in. Without this, an attacker who borrows an
    // unlocked laptop can brute-force the current password at leisure — the
    // change form is a password oracle exactly like the login form is.
    const ip = clientIdentifier(request);
    const identity = { email: user.email ?? user.id, ip };

    const throttle = await checkLoginAllowed(db, identity);
    if (!throttle.allowed) {
      return NextResponse.json(
        { ok: false, message: "Too many attempts. Please wait a few minutes." },
        { status: 429, headers: { "Retry-After": String(throttle.retryAfterSeconds) } },
      );
    }

    const { valid } = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) {
      await recordLoginFailure(db, identity);
      return NextResponse.json(
        { ok: false, field: "current_password", message: "That's not your current password." },
        { status: 403 },
      );
    }
  } else if (!user.email) {
    // A password needs an address to sign in with, and the schema's CHECK
    // enforces that — reject with an explanation rather than a constraint error.
    return NextResponse.json(
      {
        ok: false,
        message: "Add an email address to your account before setting a password.",
      },
      { status: 409 },
    );
  }

  const policy = validatePassword(newPassword, user.email ?? undefined);
  if (!policy.ok) {
    return NextResponse.json(
      { ok: false, field: "new_password", message: policy.message },
      { status: 400 },
    );
  }

  await updatePasswordHash(db, user.id, await hashPassword(newPassword));

  // Changing a password is what someone does when they believe it leaked, so
  // every *other* session is revoked — leaving them alive would make the change
  // cosmetic against an attacker who already has one. The caller's own session
  // survives, because signing someone out mid-way through securing their
  // account is how they abandon it half-done.
  const sessionId = await readSessionId();
  if (sessionId) await deleteOtherSessions(db, user.id, sessionId);

  return NextResponse.json({
    ok: true,
    message: "Password updated. Other devices were signed out.",
  });
}
