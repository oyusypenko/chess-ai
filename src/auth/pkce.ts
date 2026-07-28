/**
 * OAuth 2.0 PKCE primitives (US-A2, RFC 7636).
 *
 * Lichess is a **public client**: there is no client secret, so PKCE is what
 * stops an intercepted authorization code from being redeemed by anyone else.
 * The verifier never leaves our server — it is stored against the state row and
 * presented only at the token exchange.
 *
 * S256 only. RFC 7636 permits `plain`, but `plain` offers no protection when
 * the redirect is observable, which is the case PKCE exists for.
 */

/** RFC 7636 §4.1: 43–128 characters from the unreserved set. */
const VERIFIER_BYTES = 32; // → 43 base64url chars

export function generateCodeVerifier(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(VERIFIER_BYTES)));
}

export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * CSRF token for the authorization request.
 *
 * Distinct from the verifier: `state` proves the callback belongs to a flow we
 * started, the verifier proves the code belongs to us. Conflating them would
 * put the verifier in a URL.
 */
export function generateState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
