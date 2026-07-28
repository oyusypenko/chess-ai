import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { deleteSession } from "@/db/repositories";
import { clearSessionCookie, readSessionId } from "@/auth/session";

/**
 * `POST /api/auth/logout` (US-A2).
 *
 * Deletes the server-side session **and** clears the cookie. Clearing only the
 * cookie would leave a valid session id that anyone who captured it could keep
 * using — logout has to mean the session is gone, not hidden.
 *
 * POST, not GET: a GET logout can be triggered by any image tag on any page.
 */
export async function POST(): Promise<NextResponse> {
  const sessionId = await readSessionId();
  if (sessionId) {
    const db = await getDb();
    await deleteSession(db, sessionId);
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
