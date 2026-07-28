import { describe, it, expect, vi } from "vitest";
import { generateCodeVerifier, deriveCodeChallenge, generateState } from "./pkce";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchAccount,
  OAuthError,
  REQUESTED_SCOPES,
  LICHESS_AUTHORIZE_URL,
} from "./lichess-oauth";

describe("PKCE (RFC 7636)", () => {
  it("produces a verifier in the legal length range", () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it("produces base64url with no padding or unsafe characters", () => {
    for (let i = 0; i < 20; i += 1) {
      // A `+`, `/` or `=` would be mangled in a URL and break the exchange.
      expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9\-_]+$/);
    }
  });

  it("is unpredictable across calls", () => {
    const seen = new Set(Array.from({ length: 100 }, () => generateCodeVerifier()));
    expect(seen.size).toBe(100);
  });

  it("derives a stable S256 challenge", async () => {
    const verifier = "test-verifier-value-that-is-long-enough-here";
    const a = await deriveCodeChallenge(verifier);
    const b = await deriveCodeChallenge(verifier);
    expect(a).toBe(b);
    expect(a).not.toBe(verifier); // it must be a hash, not a pass-through
    expect(a).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it("matches the RFC 7636 appendix B test vector", async () => {
    // The known-answer test: if this drifts, our challenge is not S256.
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(await deriveCodeChallenge(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("state is distinct from the verifier", () => {
    expect(generateState()).not.toBe(generateCodeVerifier());
  });
});

describe("authorize URL", () => {
  it("carries the S256 challenge, not the verifier", async () => {
    const verifier = generateCodeVerifier();
    const url = new URL(
      await buildAuthorizeUrl({
        clientId: "chesscoach",
        redirectUri: "https://app.example/api/auth/callback",
        state: "st",
        codeVerifier: verifier,
      }),
    );

    expect(url.origin + url.pathname).toBe(LICHESS_AUTHORIZE_URL);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(await deriveCodeChallenge(verifier));
    // The verifier must NEVER appear in a URL the user's browser follows.
    expect(url.toString()).not.toContain(verifier);
  });

  it("requests no scopes at all (US-A2 minimal scopes)", async () => {
    const url = new URL(
      await buildAuthorizeUrl({
        clientId: "c",
        redirectUri: "https://app.example/cb",
        state: "s",
        codeVerifier: generateCodeVerifier(),
      }),
    );
    expect(REQUESTED_SCOPES).toHaveLength(0);
    expect(url.searchParams.get("scope")).toBeNull();
  });

  it("never requests a write scope", async () => {
    // Guard against a future edit quietly widening what we ask for.
    expect(REQUESTED_SCOPES.some((s) => s.includes("write"))).toBe(false);
    expect(REQUESTED_SCOPES.some((s) => s.includes("play"))).toBe(false);
  });
});

describe("token exchange", () => {
  it("posts the verifier and client id, form-encoded", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "tok", token_type: "Bearer" }), {
        status: 200,
      }),
    );
    await exchangeCodeForToken(
      { code: "c0de", codeVerifier: "verif", clientId: "cid", redirectUri: "https://a/cb" },
      fetchImpl,
    );

    const [, init] = fetchImpl.mock.calls[0];
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("c0de");
    expect(body.get("code_verifier")).toBe("verif");
    expect(body.get("client_id")).toBe("cid");
  });

  it("raises a user-safe error on rejection", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("bad", { status: 400 }));
    const error = await exchangeCodeForToken(
      { code: "c", codeVerifier: "v", clientId: "i", redirectUri: "r" },
      fetchImpl,
    ).catch((e) => e);

    expect(error).toBeInstanceOf(OAuthError);
    // The provider body may echo request details; it must not reach the user.
    expect(error.userMessage).not.toContain("bad");
  });

  it("rejects a 200 response with no token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(
      exchangeCodeForToken(
        { code: "c", codeVerifier: "v", clientId: "i", redirectUri: "r" },
        fetchImpl,
      ),
    ).rejects.toBeInstanceOf(OAuthError);
  });

  it("maps a network failure to a user-safe error", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(
      exchangeCodeForToken(
        { code: "c", codeVerifier: "v", clientId: "i", redirectUri: "r" },
        fetchImpl,
      ),
    ).rejects.toBeInstanceOf(OAuthError);
  });
});

describe("account lookup", () => {
  it("sends the bearer token and returns id + username", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "player", username: "Player" }), { status: 200 }),
      );
    const account = await fetchAccount("tok", fetchImpl);
    expect(account).toEqual({ id: "player", username: "Player" });
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("treats 401 as a revoked token with a re-auth message (US-A2)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    const error = await fetchAccount("tok", fetchImpl).catch((e) => e);
    expect(error).toBeInstanceOf(OAuthError);
    expect(error.userMessage).toMatch(/sign in again/i);
  });

  it("rejects an incomplete account payload", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: "x" }), { status: 200 }));
    await expect(fetchAccount("tok", fetchImpl)).rejects.toBeInstanceOf(OAuthError);
  });
});
