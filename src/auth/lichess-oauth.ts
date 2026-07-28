import { deriveCodeChallenge } from "./pkce";

/**
 * Lichess OAuth 2.0 client (US-A2).
 *
 * Endpoints confirmed from the Lichess OpenAPI spec:
 *   authorize → https://lichess.org/oauth
 *   token     → https://lichess.org/api/token
 *
 * **We request zero scopes.** US-A2 says "only the minimal scopes needed (no
 * write scopes)", and the minimum here is genuinely none: exporting a user's
 * games uses the *public* endpoint, and identifying them via `/api/account`
 * needs a valid token but no particular scope. Asking for nothing is both the
 * most defensible consent screen a user can be shown and the smallest thing to
 * lose if a token leaks.
 */

export const LICHESS_AUTHORIZE_URL = "https://lichess.org/oauth";
export const LICHESS_TOKEN_URL = "https://lichess.org/api/token";
export const LICHESS_ACCOUNT_URL = "https://lichess.org/api/account";

/** Deliberately empty — see the note above. */
export const REQUESTED_SCOPES: readonly string[] = [];

export type LichessAccount = {
  id: string;
  username: string;
};

export class OAuthError extends Error {
  readonly userMessage: string;
  constructor(message: string, userMessage: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OAuthError";
    this.userMessage = userMessage;
  }
}

export async function buildAuthorizeUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeVerifier: string;
}): Promise<string> {
  const url = new URL(LICHESS_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", await deriveCodeChallenge(options.codeVerifier));
  url.searchParams.set("state", options.state);
  if (REQUESTED_SCOPES.length > 0) {
    url.searchParams.set("scope", REQUESTED_SCOPES.join(" "));
  }
  return url.toString();
}

export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number;
};

export async function exchangeCodeForToken(
  options: {
    code: string;
    codeVerifier: string;
    clientId: string;
    redirectUri: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<TokenResponse> {
  let response: Response;
  try {
    response = await fetchImpl(LICHESS_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: options.code,
        code_verifier: options.codeVerifier,
        redirect_uri: options.redirectUri,
        client_id: options.clientId,
      }),
    });
  } catch (cause) {
    throw new OAuthError(
      "token request failed",
      "We couldn't reach Lichess to finish signing you in.",
      {
        cause,
      },
    );
  }

  if (!response.ok) {
    // The body may name the reason, but it is not safe to surface verbatim —
    // it can echo request details back to the user.
    throw new OAuthError(
      `token endpoint returned ${response.status}`,
      "Lichess didn't accept that sign-in. Please try again.",
    );
  }

  const token = (await response.json()) as TokenResponse;
  if (!token?.access_token) {
    throw new OAuthError("token response missing access_token", "Sign-in with Lichess failed.");
  }
  return token;
}

export async function fetchAccount(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LichessAccount> {
  let response: Response;
  try {
    response = await fetchImpl(LICHESS_ACCOUNT_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (cause) {
    throw new OAuthError("account request failed", "We couldn't reach Lichess.", { cause });
  }

  // 401 here means the token was revoked on Lichess's side. US-A2 requires this
  // be handled gracefully — the caller prompts a re-auth rather than crashing.
  if (response.status === 401) {
    throw new OAuthError(
      "token rejected",
      "Your Lichess connection has expired. Please sign in again.",
    );
  }
  if (!response.ok) {
    throw new OAuthError(
      `account endpoint returned ${response.status}`,
      "Lichess is unavailable right now.",
    );
  }

  const account = (await response.json()) as Partial<LichessAccount>;
  if (!account?.id || !account?.username) {
    throw new OAuthError("account response incomplete", "Sign-in with Lichess failed.");
  }
  return { id: account.id, username: account.username };
}
