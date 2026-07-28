import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireUser, UnauthorizedError } from "@/auth/session";
import { listGames, type GameFilters } from "@/db/repositories";

/**
 * `GET /api/games` — the signed-in user's game list (US-B1, US-B3).
 *
 * Filters are validated against allow-lists rather than passed through: they
 * reach a SQL predicate, and an allow-list means an unexpected value is
 * ignored instead of trusted (NFR-S2).
 */

const SPEEDS = new Set(["ultraBullet", "bullet", "blitz", "rapid", "classical", "correspondence"]);
const COLORS = new Set(["white", "black"]);
const RESULTS = new Set(["win", "loss", "draw"]);

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

  const params = new URL(request.url).searchParams;
  const filters: GameFilters = {
    speed: SPEEDS.has(params.get("speed") ?? "") ? (params.get("speed") as string) : undefined,
    color: COLORS.has(params.get("color") ?? "")
      ? (params.get("color") as "white" | "black")
      : undefined,
    result: RESULTS.has(params.get("result") ?? "")
      ? (params.get("result") as "win" | "loss" | "draw")
      : undefined,
    limit: Number(params.get("limit") ?? 20),
    offset: Number(params.get("offset") ?? 0),
  };

  const rows = await listGames(db, user.id, filters);

  // The stored payload stays out of the list response — it is the full game,
  // and sending 20 of them would make the list slow for no benefit.
  return NextResponse.json({
    ok: true,
    games: rows.map((row) => {
      const { payload: _payload, ...rest } = row;
      return { ...rest, analyzed: (rest.analyzed ?? 0) > 0 };
    }),
  });
}
