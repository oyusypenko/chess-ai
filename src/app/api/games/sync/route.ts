import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireUser, UnauthorizedError } from "@/auth/session";
import { fetchUserGames } from "@/lichess/client";
import { normalizeLichessGame } from "@/lichess/normalize";
import { ImportError } from "@/lichess/errors";
import { saveGame } from "@/db/repositories";
import { checkRateLimit, clientIdentifier, MemoryRateLimitStore } from "@/server/rate-limit";
import { track } from "@/server/telemetry";

/**
 * `POST /api/games/sync` — import the signed-in user's recent games (US-B1).
 *
 * Uses the **public** export endpoint rather than the stored OAuth token: the
 * games are public, so sending a token would be gratuitous, and not sending one
 * means a revoked token cannot break the import. The token exists to identify
 * the account, nothing more (see the zero-scopes note in lichess-oauth.ts).
 *
 * Rate-limited on its own scope so a sync loop cannot consume the report
 * allowance. FR-2's 429 contract is handled inside the client.
 */

const syncLimiter = new MemoryRateLimitStore();

/** US-B1: N = 20, configurable. */
const DEFAULT_MAX = 20;

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

  const limit = await checkRateLimit(syncLimiter, clientIdentifier(request), {
    scope: "sync",
    limit: 20,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, message: "Too many syncs today. Please try again tomorrow." },
      { status: 429 },
    );
  }

  // An email+password account has no Lichess handle, and there is nothing to
  // import without one. Say so plainly instead of querying the export endpoint
  // for `null` and surfacing whatever Lichess makes of that.
  const lichessName = user.lichess_name;
  if (!lichessName) {
    return NextResponse.json(
      {
        ok: false,
        kind: "not_linked",
        message: "Connect your Lichess account to import games.",
      },
      { status: 409 },
    );
  }

  const max = Number(new URL(request.url).searchParams.get("max") ?? DEFAULT_MAX);

  try {
    const raw = await fetchUserGames(lichessName, {
      max: Number.isFinite(max) ? Math.min(Math.max(max, 1), 100) : DEFAULT_MAX,
      signal: request.signal,
    });

    let imported = 0;
    let skipped = 0;
    for (const rawGame of raw) {
      try {
        // Normalization enforces NFR-L1 on its own; a game that fails it is
        // skipped rather than failing the whole sync.
        const game = normalizeLichessGame(rawGame, lichessName);
        await saveGame(db, user.id, game);
        imported += 1;
      } catch {
        skipped += 1;
      }
    }

    track("import_succeeded", { imported, skipped });
    return NextResponse.json({ ok: true, imported, skipped });
  } catch (error) {
    if (error instanceof ImportError) {
      track("import_failed", { kind: error.kind });
      return NextResponse.json(
        { ok: false, kind: error.kind, message: error.userMessage, retryable: error.retryable },
        { status: error.kind === "user_not_found" ? 404 : 502 },
      );
    }
    console.error("[sync] unexpected failure", error);
    return NextResponse.json(
      { ok: false, message: "We couldn't sync your games. Please try again." },
      { status: 500 },
    );
  }
}
