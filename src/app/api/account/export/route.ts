import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireUser, UnauthorizedError } from "@/auth/session";
import { displayName, listGames, listReports, listSessions } from "@/db/repositories";
import type { NormalizedGame } from "@/model/game";

/**
 * `GET /api/account/export` — GDPR data export (US-A4, NFR-PR3).
 *
 * Returns everything we hold about the user, in a form they can actually use:
 * JSON for the reports, and **PGN for the games**, because PGN is what every
 * other chess tool reads. An export nobody can open is not a right honoured.
 *
 * The OAuth token is deliberately excluded. It is our credential for talking to
 * Lichess on their behalf, not personal data of theirs, and putting it in a
 * downloadable file would be handing out a bearer token.
 */
export async function GET(request: Request): Promise<NextResponse> {
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

  const format = new URL(request.url).searchParams.get("format") ?? "json";
  const games = await listGames(db, user.id, { limit: 100 });
  // Filename-safe: an email local-part can contain characters that would break
  // the Content-Disposition header or, worse, be read as a second parameter.
  const slug = displayName(user).replace(/[^a-zA-Z0-9_-]/g, "-");

  if (format === "pgn") {
    const pgn = games.map((row) => toPgn(JSON.parse(row.payload) as NormalizedGame)).join("\n\n");
    return new NextResponse(pgn, {
      headers: {
        "Content-Type": "application/x-chess-pgn; charset=utf-8",
        "Content-Disposition": `attachment; filename="chesscoach-games-${slug}.pgn"`,
      },
    });
  }

  const reports = await listReports(db, user.id, 500);
  const sessions = await listSessions(db, user.id);

  const payload = {
    exportedAt: new Date().toISOString(),
    account: {
      email: user.email,
      lichessId: user.lichess_id,
      lichessName: user.lichess_name,
      createdAt: user.created_at,
      plan: user.plan,
    },
    // Sessions are personal data we hold about them, so they belong in a
    // subject-access export. The session ids are not included: they are live
    // bearer credentials, and a downloadable file full of them is a file that
    // signs in as the user if it ever leaks.
    sessions: sessions.map((session) => ({
      createdAt: session.created_at,
      lastUsedAt: session.last_used_at,
      expiresAt: session.expires_at,
      authMethod: session.auth_method,
      userAgent: session.user_agent,
    })),
    games: games.map((row) => JSON.parse(row.payload)),
    reports: reports.map((report) => ({
      gameId: report.game_id,
      engineVersion: report.engine_version,
      promptVersion: report.prompt_version,
      model: report.model,
      summary: report.summary_text,
      accuracy: report.accuracy,
      createdAt: report.created_at,
    })),
    note: "Your Lichess access token, your password hash, and your session ids are not included: they are credentials, not personal data, and are deleted when you delete your account.",
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="chesscoach-export-${slug}.json"`,
    },
  });
}

/** Minimal but valid PGN — seven-tag roster plus the movetext. */
function toPgn(game: NormalizedGame): string {
  const result = game.winner === "white" ? "1-0" : game.winner === "black" ? "0-1" : "1/2-1/2";
  const date = game.playedAt.slice(0, 10).replace(/-/g, ".");

  const tags = [
    `[Event "${game.rated ? "Rated" : "Casual"} ${game.speed}"]`,
    `[Site "${game.url}"]`,
    `[Date "${date}"]`,
    `[Round "-"]`,
    `[White "${game.players.white.username ?? "?"}"]`,
    `[Black "${game.players.black.username ?? "?"}"]`,
    `[Result "${result}"]`,
    game.opening.eco ? `[ECO "${game.opening.eco}"]` : null,
    game.opening.name ? `[Opening "${game.opening.name}"]` : null,
  ].filter(Boolean);

  const movetext: string[] = [];
  for (const move of game.moves) {
    if (move.color === "white") movetext.push(`${Math.ceil(move.ply / 2)}.`);
    movetext.push(move.san);
  }
  movetext.push(result);

  return `${tags.join("\n")}\n\n${wrap(movetext.join(" "))}`;
}

/** PGN convention: wrap movetext at 80 columns. */
function wrap(text: string, width = 80): string {
  const lines: string[] = [];
  let line = "";
  for (const token of text.split(" ")) {
    if (line.length + token.length + 1 > width) {
      lines.push(line);
      line = token;
    } else {
      line = line ? `${line} ${token}` : token;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}
