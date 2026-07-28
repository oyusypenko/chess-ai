import { NextResponse } from "next/server";
import { fetchMostRecentGame, isValidUsername } from "@/lichess/client";
import { normalizeLichessGame } from "@/lichess/normalize";
import { ImportError, IMPORT_ERROR_MESSAGES } from "@/lichess/errors";
import type { NormalizedGame } from "@/model/game";

/**
 * `GET /api/import?username=…` — fetch and normalize a user's most recent
 * finished game (US-A1, US-B1).
 *
 * Server-side because FR-2's rate-limit contract and NFR-S2's identifier
 * validation must hold no matter what the client does. The demo quota
 * (3/IP/day, US-A1) lands here in M7 — this handler is where it belongs.
 */

export type ImportSuccess = { ok: true; game: NormalizedGame };
export type ImportFailure = { ok: false; kind: string; message: string; retryable: boolean };

/** HTTP status per failure kind. Distinguishes "your input" from "our problem". */
const STATUS_BY_KIND: Record<string, number> = {
  invalid_username: 400,
  user_not_found: 404,
  no_finished_games: 404,
  rate_limited: 429,
  platform_unavailable: 502,
  network: 504,
  malformed_response: 502,
};

export async function GET(request: Request): Promise<NextResponse<ImportSuccess | ImportFailure>> {
  const username = new URL(request.url).searchParams.get("username")?.trim() ?? "";

  // NFR-S2: validate before the value reaches an outbound URL.
  if (!isValidUsername(username)) {
    return NextResponse.json(
      {
        ok: false,
        kind: "invalid_username",
        message: IMPORT_ERROR_MESSAGES.invalid_username,
        retryable: false,
      },
      { status: 400 },
    );
  }

  try {
    const raw = await fetchMostRecentGame(username, { signal: request.signal });
    const game = normalizeLichessGame(raw, username);
    return NextResponse.json({ ok: true, game });
  } catch (error) {
    // NFR-R2: every failure becomes a designed, user-safe response. A stack
    // trace must never reach the client (US-A1).
    if (error instanceof ImportError) {
      return NextResponse.json(
        {
          ok: false,
          kind: error.kind,
          message: error.userMessage,
          retryable: error.retryable,
        },
        { status: STATUS_BY_KIND[error.kind] ?? 502 },
      );
    }

    // Unknown failure: log the detail server-side, tell the user something
    // honest and useless-to-an-attacker.
    console.error("[import] unexpected failure", error);
    return NextResponse.json(
      {
        ok: false,
        kind: "unexpected",
        message: "Something went wrong on our end. Please try again.",
        retryable: true,
      },
      { status: 500 },
    );
  }
}
