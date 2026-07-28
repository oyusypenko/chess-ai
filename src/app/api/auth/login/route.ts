import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { saveOAuthState } from "@/db/repositories";
import { generateCodeVerifier, generateState } from "@/auth/pkce";
import { buildAuthorizeUrl } from "@/auth/lichess-oauth";

/**
 * `GET /api/auth/login` — start the Lichess OAuth flow (US-A2).
 *
 * The PKCE verifier is stored **server-side** against the state, not in a
 * cookie. A cookie-held verifier is readable by anything that can read cookies
 * on the domain, which defeats the point of proving possession at the token
 * exchange.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const clientId = process.env.LICHESS_CLIENT_ID;
  if (!clientId) {
    // A missing client id is a deployment error, not a user error.
    return NextResponse.json(
      { ok: false, message: "Sign-in is not configured on this deployment." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const redirectUri = process.env.LICHESS_REDIRECT_URI ?? `${url.origin}/api/auth/callback`;

  // Only same-origin paths — an open redirect here would let a phishing link
  // bounce a freshly-authenticated user to an attacker's page.
  const requested = url.searchParams.get("redirect_to");
  const redirectTo =
    requested && requested.startsWith("/") && !requested.startsWith("//") ? requested : "/games";

  const db = await getDb();
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  await saveOAuthState(db, state, codeVerifier, redirectTo);

  const authorizeUrl = await buildAuthorizeUrl({ clientId, redirectUri, state, codeVerifier });
  return NextResponse.redirect(authorizeUrl);
}
