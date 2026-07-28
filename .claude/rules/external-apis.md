---
paths:
  - "src/lichess/**"
  - "src/chesscom/**"
  - "src/clients/**"
  - "src/app/api/**"
  - "app/api/**"
---

# External API clients (owner: chess-backend)

Design refs: FR-1, FR-2, US-A1, US-A2, US-A3, US-B1, US-B2, NFR-R2, NFR-S2 · plan §1.3–1.4.

## Lichess (FR-2)

- **NDJSON streaming** for game exports; request evals, clocks, and opening tags when available
  (they feed US-C2 eval reuse and the game list). One export stream at a time per user — the API
  caps concurrent streams per IP at 8 and we are nowhere near needing more.
- **On HTTP 429: wait ≥ 60 s, retry exactly once**, and show "Lichess is rate-limiting us,
  retrying…". Never hammer, never fail silently.
- Games finished < 1 minute ago may not be exported yet — message that state explicitly instead of
  rendering an empty list (US-B1).
- OAuth (P1) is **Authorization Code + PKCE**, minimal read-only scopes, no write scopes. Tokens
  encrypted at rest; revocation on Lichess's side prompts re-auth rather than crashing (US-A2).

## chess.com Published-Data API (FR-1, P2)

- **Never called from the browser** — all traffic goes through our backend proxy (hook-enforced).
- Custom `User-Agent` with app name + contact email on **every** request; calls without it get 403.
- **Serial per user** (no parallel archive fetches), global concurrency cap, exponential backoff on
  429/403.
- Cache: past monthly archives are immutable → cache indefinitely; current month gets a short TTL.
- There is no OAuth — "linking" is claiming a public username, verified against the API before
  saving, with a disclaimer that only public games are read (US-A3).

## All third parties

- **Normalize at the boundary.** Everything becomes the internal game model immediately; no
  downstream code branches on which platform a game came from. This is what keeps chess.com (P2)
  from becoming a rewrite.
- **Validate every external identifier server-side** — usernames, game IDs — before use (NFR-S2).
- **Outages produce designed states, never blank screens** (NFR-R2). Enumerate the failure modes
  for each client: unknown user, zero games, 429, 5xx, malformed PGN, network timeout.
- Rate limits and quotas that protect _us_ (3 demo reports per IP per day, free-tier caps) are
  enforced server-side in Redis, not in the client (US-A1, US-F1).
