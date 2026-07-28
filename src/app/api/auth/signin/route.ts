import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getUserByEmail, updatePasswordHash } from "@/db/repositories";
import { fakeVerify, hashPassword, normalizeEmail, verifyPassword } from "@/auth/password";
import { openSession, safeRedirect } from "@/auth/sign-in";
import { checkLoginAllowed, clearLoginFailures, recordLoginFailure } from "@/server/auth-throttle";
import { clientIdentifier } from "@/server/rate-limit";

/**
 * `POST /api/auth/signin` — email + password sign-in (US-A2, NFR-S1).
 *
 * ## One failure message, always
 *
 * Wrong password, no such account, and an OAuth-only account with no password
 * set all return the same 401 with the same text. Distinguishing them turns the
 * form into an account-enumeration oracle: an attacker learns which addresses
 * are registered here, which is worth having on its own and worth more when
 * combined with a breach corpus.
 *
 * The wording matters too. "Email or password is incorrect" tells the honest
 * user exactly what to do (check both) while telling an attacker nothing.
 */
const REJECTION = "Email or password is incorrect.";

export async function POST(request: Request): Promise<NextResponse> {
  let body: { email?: unknown; password?: unknown; redirect_to?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ ok: false, message: REJECTION }, { status: 401 });
  }

  const db = await getDb();
  const ip = clientIdentifier(request);

  const throttle = await checkLoginAllowed(db, { email, ip });
  if (!throttle.allowed) {
    return NextResponse.json(
      {
        ok: false,
        message: "Too many sign-in attempts. Please wait a few minutes and try again.",
      },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfterSeconds) } },
    );
  }

  const user = await getUserByEmail(db, email);

  // No account, or an account that only ever used OAuth. Burn the same CPU a
  // real verification would before rejecting — otherwise this path returns in
  // microseconds while a genuine wrong-password takes ~72 ms, and that gap is a
  // reliable enumeration signal no matter how identical the response bodies are.
  if (!user?.password_hash) {
    await fakeVerify(password);
    await recordLoginFailure(db, { email, ip });
    return NextResponse.json({ ok: false, message: REJECTION }, { status: 401 });
  }

  const { valid, needsRehash } = await verifyPassword(password, user.password_hash);
  if (!valid) {
    await recordLoginFailure(db, { email, ip });
    return NextResponse.json({ ok: false, message: REJECTION }, { status: 401 });
  }

  // A correct sign-in is the only moment we hold the plaintext, so it is the
  // only chance to re-hash at a raised iteration count.
  if (needsRehash) {
    try {
      await updatePasswordHash(db, user.id, await hashPassword(password));
    } catch (error) {
      // An upgrade failure must never block a valid sign-in — the existing hash
      // still verifies fine.
      console.warn("[auth] password rehash failed", error);
    }
  }

  await clearLoginFailures(db, email);
  await openSession(db, user.id, request, "password");

  return NextResponse.json({ ok: true, redirect_to: safeRedirect(body.redirect_to as string) });
}
