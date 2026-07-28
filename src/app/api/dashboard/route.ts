import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireUser, UnauthorizedError } from "@/auth/session";
import { listReports } from "@/db/repositories";
import { buildAggregate, detectWeaknesses, type ReportSummary } from "@/dashboard/aggregate";
import type { GameClassification } from "@/classifier/classify-game";
import { phaseOf } from "@/report/build-payload";

/**
 * `GET /api/dashboard?window=25|50|100` — cross-game statistics (US-E1, US-E2).
 *
 * Reads **stored reports** only. US-E1 requires the dashboard load in ≤ 3 s
 * from cached data and explicitly forbids re-analysis on view, so nothing here
 * touches the engine or an external API.
 */

const WINDOWS = new Set([25, 50, 100]);
const LOW_CLOCK_FRACTION = 0.15;

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

  const requested = Number(new URL(request.url).searchParams.get("window") ?? 25);
  const window = WINDOWS.has(requested) ? requested : 25;

  // Pull the largest window once; narrowing in memory avoids three queries for
  // what is one dataset.
  const rows = await listReports(db, user.id, 100);

  const summaries: ReportSummary[] = rows.map((row) => {
    const classification = JSON.parse(row.classification) as GameClassification & {
      meta?: {
        playedAt?: string;
        speed?: string;
        color?: "white" | "black";
        result?: "win" | "loss" | "draw";
        eco?: string | null;
        openingName?: string | null;
        initialCentis?: number | null;
      };
    };
    const meta = classification.meta ?? {};
    const color = meta.color ?? "white";
    const initialCentis = meta.initialCentis ?? null;

    return {
      gameId: row.game_id,
      playedAt: meta.playedAt ?? row.created_at,
      speed: meta.speed ?? "unknown",
      color,
      result: meta.result ?? "draw",
      eco: meta.eco ?? null,
      openingName: meta.openingName ?? null,
      accuracy: row.accuracy,
      counts: classification.subjectCounts ?? {},
      mistakes: (classification.moves ?? [])
        .filter((m) => m.color === color && m.severity > 0)
        .map((m) => ({
          ply: m.ply,
          classification: m.classification,
          phase: phaseOf(m.ply, classification.moves.length),
          lowClock:
            initialCentis !== null &&
            m.clockCentis !== undefined &&
            m.clockCentis < initialCentis * LOW_CLOCK_FRACTION,
        })),
    };
  });

  return NextResponse.json({
    ok: true,
    aggregate: buildAggregate(summaries, window),
    weaknesses: detectWeaknesses(summaries.slice(0, window)),
    totalReports: summaries.length,
  });
}
