import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { deleteOtherSessions, deleteUserSession, listSessions } from "@/db/repositories";
import { readSessionId, requireUser, UnauthorizedError } from "@/auth/session";

/**
 * Session management (US-A4, NFR-S1).
 *
 * `GET`  — list the account's live sessions.
 * `POST` — revoke one (`{ session_id }`) or all others (`{ all_others: true }`).
 *
 * This is the visible half of "sessions are server-side rows": revocation is a
 * DELETE that takes effect on the very next request, which is the property a
 * stateless JWT cannot offer at any price.
 */

async function authed(): Promise<
  { ok: true; db: Awaited<ReturnType<typeof getDb>>; userId: string } | { ok: false }
> {
  const db = await getDb();
  try {
    const user = await requireUser(db);
    return { ok: true, db, userId: user.id };
  } catch (error) {
    if (error instanceof UnauthorizedError) return { ok: false };
    throw error;
  }
}

export async function GET(): Promise<NextResponse> {
  const auth = await authed();
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: 401 });

  const currentId = await readSessionId();
  const sessions = await listSessions(auth.db, auth.userId);

  return NextResponse.json({
    ok: true,
    sessions: sessions.map((s) => ({
      id: s.id,
      created_at: s.created_at,
      last_used_at: s.last_used_at,
      expires_at: s.expires_at,
      auth_method: s.auth_method,
      user_agent: s.user_agent,
      // So the UI can label "this device" and refuse to offer a revoke button
      // that would sign the user out of the page they are looking at.
      current: s.id === currentId,
    })),
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await authed();
  if (!auth.ok) return NextResponse.json({ ok: false }, { status: 401 });

  let body: { session_id?: unknown; all_others?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  const currentId = await readSessionId();

  if (body.all_others === true) {
    if (!currentId) {
      return NextResponse.json({ ok: false, message: "No active session." }, { status: 400 });
    }
    await deleteOtherSessions(auth.db, auth.userId, currentId);
    return NextResponse.json({ ok: true, message: "Signed out everywhere else." });
  }

  const sessionId = typeof body.session_id === "string" ? body.session_id : "";
  if (!sessionId) {
    return NextResponse.json({ ok: false, message: "Which session?" }, { status: 400 });
  }
  if (sessionId === currentId) {
    // Not an error worth a 4xx, but routing it through here would leave the
    // user signed out with the account page still on screen. Logout is a
    // different endpoint precisely because it also clears the cookie.
    return NextResponse.json(
      { ok: false, message: "That's this device — use sign out instead." },
      { status: 400 },
    );
  }

  // Ownership is enforced inside the query, not by a check here.
  const removed = await deleteUserSession(auth.db, auth.userId, sessionId);
  if (!removed) {
    return NextResponse.json({ ok: false, message: "Session not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, message: "Session revoked." });
}
