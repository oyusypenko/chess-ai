import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { createUserWithPassword, EmailTakenError } from "@/db/repositories";
import { hashPassword, isPlausibleEmail, normalizeEmail, validatePassword } from "@/auth/password";
import { openSession, safeRedirect } from "@/auth/sign-in";
import { checkRegisterAllowed } from "@/server/auth-throttle";
import { clientIdentifier } from "@/server/rate-limit";
import { track } from "@/server/telemetry";

/**
 * `POST /api/auth/register` — create an email + password account (US-A2).
 *
 * Registration signs the user in on success. Making someone type the password
 * they just chose a second time, on a different page, is friction with no
 * security value.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: { email?: unknown; password?: unknown; redirect_to?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!isPlausibleEmail(email)) {
    return NextResponse.json(
      { ok: false, field: "email", message: "That doesn't look like an email address." },
      { status: 400 },
    );
  }

  const policy = validatePassword(password, email);
  if (!policy.ok) {
    return NextResponse.json(
      { ok: false, field: "password", message: policy.message },
      { status: 400 },
    );
  }

  const db = await getDb();

  // Before hashing: PBKDF2 at 600k iterations is expensive by design, which
  // makes an unthrottled registration endpoint a CPU-exhaustion lever anyone
  // can pull.
  const throttle = await checkRegisterAllowed(db, clientIdentifier(request));
  if (!throttle.allowed) {
    return NextResponse.json(
      { ok: false, message: "Too many accounts created from here. Please try again later." },
      { status: 429, headers: { "Retry-After": String(throttle.retryAfterSeconds) } },
    );
  }

  try {
    const user = await createUserWithPassword(db, email, await hashPassword(password));
    await openSession(db, user.id, request, "password");

    // No address in the event (FR-6).
    track("username_submitted", { via: "password" });

    return NextResponse.json({ ok: true, redirect_to: safeRedirect(body.redirect_to as string) });
  } catch (error) {
    if (error instanceof EmailTakenError) {
      // Account enumeration is accepted here, and the trade is deliberate: a
      // signup form *must* tell you the address is taken or it cannot be used
      // at all. The sign-in route, where the same disclosure would be a gift to
      // an attacker, says nothing — see its handler.
      return NextResponse.json(
        {
          ok: false,
          field: "email",
          message: "An account with that email already exists. Try signing in instead.",
        },
        { status: 409 },
      );
    }
    console.error("[auth] registration failed", error);
    return NextResponse.json(
      { ok: false, message: "Something went wrong creating your account." },
      { status: 500 },
    );
  }
}
