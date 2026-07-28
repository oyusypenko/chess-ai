import { NextResponse } from "next/server";
import { getDb } from "@/db";
import {
  consumeOAuthState,
  createSession,
  saveAccessToken,
  upsertUserByLichessId,
} from "@/db/repositories";
import { exchangeCodeForToken, fetchAccount, OAuthError } from "@/auth/lichess-oauth";
import { setSessionCookie } from "@/auth/session";
import { readKeyMaterial } from "@/db/crypto";
import { track } from "@/server/telemetry";

/**
 * `GET /api/auth/callback` — finish the OAuth flow (US-A2).
 *
 * Order matters and is deliberate:
 *   1. Consume the state (single use — blocks replay of a leaked callback URL).
 *   2. Exchange the code using the stored verifier.
 *   3. Identify the account.
 *   4. Create/refresh the user, store the token **encrypted**, open a session.
 *
 * Failures redirect to a friendly page rather than rendering an error body:
 * this URL is visited by a browser following a redirect, so a JSON error would
 * be shown raw to the user.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const origin = url.origin;

  const failure = (reason: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);

  // The user declined on Lichess's consent screen — not an error worth alarming
  // them about.
  if (url.searchParams.get("error")) return NextResponse.redirect(`${origin}/login?declined=1`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return failure("missing_parameters");

  const clientId = process.env.LICHESS_CLIENT_ID;
  if (!clientId) return failure("not_configured");

  let keyMaterial: string;
  try {
    keyMaterial = readKeyMaterial();
  } catch {
    // Refuse rather than storing a token in plaintext (US-A2, NFR-S1).
    return failure("not_configured");
  }

  const db = await getDb();

  const stored = await consumeOAuthState(db, state);
  if (!stored) return failure("expired_or_replayed");

  const redirectUri = process.env.LICHESS_REDIRECT_URI ?? `${origin}/api/auth/callback`;

  try {
    const token = await exchangeCodeForToken({
      code,
      codeVerifier: stored.code_verifier,
      clientId,
      redirectUri,
    });

    const account = await fetchAccount(token.access_token);
    const user = await upsertUserByLichessId(db, account.id.toLowerCase(), account.username);

    await saveAccessToken(db, user.id, token.access_token, keyMaterial, {
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null,
      scopes: "",
    });

    const session = await createSession(db, user.id);
    await setSessionCookie(session.id, session.expiresAt);

    // No username in the event (FR-6).
    track("username_submitted", { via: "oauth" });

    return NextResponse.redirect(`${origin}${stored.redirect_to ?? "/games"}`);
  } catch (error) {
    if (error instanceof OAuthError) {
      console.warn(`[auth] ${error.message}`);
      return failure("provider_error");
    }
    console.error("[auth] unexpected callback failure", error);
    return failure("unexpected");
  }
}
