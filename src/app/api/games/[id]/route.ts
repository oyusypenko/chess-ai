import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireUser, UnauthorizedError } from "@/auth/session";
import { getGame, getReport } from "@/db/repositories";
import type { NormalizedGame } from "@/model/game";

/**
 * `GET /api/games/:id` — one game plus its saved report, if any.
 *
 * Returning the report here is what makes US-B1's "re-opening never
 * re-analyzes" true at the account level: the client checks for a stored report
 * before starting the engine.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

  const { id } = await context.params;
  // Ownership is enforced in the query — a game id is guessable.
  const row = await getGame(db, user.id, decodeURIComponent(id));
  if (!row) {
    return NextResponse.json({ ok: false, message: "Game not found." }, { status: 404 });
  }

  const report = await getReport(db, user.id, row.id);

  return NextResponse.json({
    ok: true,
    game: JSON.parse(row.payload) as NormalizedGame,
    report: report
      ? {
          engineVersion: report.engine_version,
          promptVersion: report.prompt_version,
          model: report.model,
          summaryText: report.summary_text,
          summaryStatus: report.summary_status,
          accuracy: report.accuracy,
          classification: JSON.parse(report.classification),
          evals: JSON.parse(report.evals),
          createdAt: report.created_at,
        }
      : null,
  });
}
