import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireUser, UnauthorizedError, clearSessionCookie } from "@/auth/session";
import { deleteUser } from "@/db/repositories";

/**
 * `POST /api/account/delete` — account deletion (US-A4, NFR-PR3).
 *
 * **Immediate, not queued.** US-A4 allows up to 30 days; we delete now, because
 * a deletion that has actually happened cannot be forgotten by a job that never
 * ran. Every user-owned table cascades from `users`, so this is one statement
 * and cannot drift out of date when a table is added.
 *
 * Requires the user to type their handle. Deletion is irreversible, so it asks
 * for something only the account owner can supply — a stray POST cannot destroy
 * an account.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const db = await getDb();

  let user;
  try {
    user = await requireUser(db);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, message: "Please sign in." }, { status: 401 });
    }
    throw error;
  }

  let body: { confirm?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: "Malformed request." }, { status: 400 });
  }

  if ((body?.confirm ?? "").trim().toLowerCase() !== user.lichess_name.toLowerCase()) {
    return NextResponse.json(
      { ok: false, message: `Type ${user.lichess_name} to confirm deletion.` },
      { status: 400 },
    );
  }

  await deleteUser(db, user.id);
  await clearSessionCookie();

  return NextResponse.json({
    ok: true,
    message:
      "Your account and all of its data have been deleted. Your Lichess account is untouched — you may also want to revoke this app from your Lichess token settings.",
  });
}
