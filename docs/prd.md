# ChessCoach AI — Product Requirements & User Stories (MVP)

| | |
|---|---|
| **Status** | Draft v0.1 |
| **Product** | Web app: post-game AI coaching for Lichess & chess.com players |
| **Audience** | Technical team (dev, design, QA) |
| **Last updated** | 2026-07-28 |

---

## 1. Product overview

A web application that imports a player's finished games from **Lichess** (OAuth) and **chess.com** (public data API), analyzes them with **Stockfish running client-side (WASM)**, classifies every move, and generates a **plain-language AI coaching report**: what went well, what went wrong, why, and what to practice. Over time, the app aggregates results into a **weakness dashboard** (recurring mistakes, progress trends) — the main retention and paid feature.

**Core principle (non-negotiable): engine-first, LLM-explains.** The LLM never evaluates positions itself. It only narrates structured facts produced by the engine (evals, best lines, move classifications). This prevents hallucinated chess analysis.

**Hard product constraint (non-negotiable): post-game only.** No feature may provide assistance during a live game. Real-time help violates chess.com/Lichess fair-play rules, gets users banned, and gets the product removed from stores. This applies to the web app and any future extension.

### Non-goals (MVP)
- No live-game analysis or board overlays during play
- No playing against an AI / bot
- No native mobile apps (Stockfish GPL licensing for stores needs separate legal review)
- No use of chess.com's IP: piece sets, sounds, move-classification glyph designs, or their exact badge naming/iconography
- No puzzles/drills generation (later phase)

---

## 2. Goals & success metrics

| Metric | Target | Notes |
|---|---|---|
| Activation | ≥ 60% of visitors who submit a username get a complete report | Funnel event-tracked |
| Repeat usage | ≥ 25% of activated users return within 7 days | Retention hook = dashboard |
| Free → paid conversion | ≥ 2% | Kill/pivot threshold from business plan |
| Monthly churn (paid) | ≤ 8% | |
| LLM cost per full report | ≤ $0.02 | Enforced by token budget + cheap model default |
| Engine compute cost | ~$0 (client-side) | Server eval only as premium/fallback |
| Report generation success rate | ≥ 99% | Graceful degradation if LLM provider is down |

---

## 3. Personas

1. **Casual improver "Marta"** (rating 800–1500, plays on phone/laptop, 3–10 games/week). Doesn't understand engine lines like `+1.7 Nf5!`. Wants: "explain in human words what I did wrong."
2. **Ambitious club player "Tomek"** (1500–2100, plays daily, already uses free analysis). Wants: recurring-weakness detection, opening stats, time-management insights across many games.
3. **Coach "Igor"** (Phase 3, B2B). Wants one dashboard auto-reviewing all his students' games. Out of MVP scope but must not be blocked by architecture decisions (multi-account data model).

---

## 4. Release phases

| Phase | Contents | Purpose |
|---|---|---|
| **P0 — Validation demo** | No accounts. Enter username → 1 free AI report (Lichess first). Waitlist email capture. | Validate demand before building billing |
| **P1 — MVP** | Lichess OAuth, game list, full reports, basic weakness dashboard, free/paid tiers, checkout | Launchable paid product |
| **P2** | chess.com import, study recommendations, share links, thin browser-extension launcher button | TAM expansion |
| **P3** | Coach/club dashboard (B2B), mobile wrapper, drills | Growth |

Priorities below use **MoSCoW**: Must / Should / Could (Won't = out of scope).

---

## 5. Epics & user stories

### Epic A — Onboarding & accounts

**US-A1 · Guest demo report** — *Must, P0*
> As a visitor, I want to enter my Lichess username and get one free AI-coached report of my latest game without creating an account, so that I can see the value before signing up.

Acceptance criteria:
- Given a valid public Lichess username, when submitted, then the app fetches the most recent finished game and renders a complete report (engine analysis + AI summary + key moments) in **≤ 60 s** on 2020+ mid-range hardware.
- Given a nonexistent username or a user with zero finished games, then a clear, friendly error is shown (no stack traces, no crash).
- Demo is rate-limited to **3 reports per IP per day**; limit enforced server-side.
- A visible email-capture field ("get your full weakness report at launch") stores emails with explicit consent checkbox (GDPR).

**US-A2 · Sign in with Lichess** — *Must, P1*
> As a player, I want to log in with my Lichess account so that my games and reports are saved to my profile.

Acceptance criteria:
- OAuth 2.0 **Authorization Code + PKCE** flow per Lichess API docs; only the minimal scopes needed (no write scopes).
- On first login an account is created keyed to the Lichess user ID; no passwords are stored anywhere.
- Access tokens are stored **encrypted at rest**; token revocation on Lichess side is handled gracefully (user is prompted to re-auth, app does not crash).
- Logout clears the session; "Delete my account" is reachable from settings (see US-A4).

**US-A3 · Link chess.com username** — *Must, P2*
> As a chess.com player, I want to add my chess.com username so that my games from there are imported too.

Acceptance criteria:
- chess.com has **no public OAuth**; linking = claiming a public username. The app verifies the username exists via the Published-Data API before saving.
- All chess.com API calls go through the **backend proxy** (never from the browser) with the required custom `User-Agent` header containing app name + contact email (calls without it get 403).
- A short disclaimer explains that only publicly available games are read.

**US-A4 · Account deletion & data export (GDPR)** — *Must, P1*
- User can trigger full deletion of account, imported games, reports, and analytics identifiers; completed within **30 days**; confirmation email sent.
- User can download their data (reports + game list) as JSON/PGN.

---

### Epic B — Game import

**US-B1 · Import recent Lichess games** — *Must, P1*
> As a logged-in player, I want my recent games fetched automatically so that I can pick one to review.

Acceptance criteria:
- Fetch last **N = 20** (configurable) finished games via the Lichess export API (NDJSON), requesting server evals, clocks, and opening tags when available.
- Game list shows: date, opponent + rating, color, result, time control, opening name (ECO), and an "analyzed" badge if a report already exists.
- HTTP 429 responses trigger exponential backoff and a single automatic retry after ≥ 60 s; the UI shows "Lichess is rate-limiting us, retrying…" instead of failing silently.
- Games finished < 1 minute ago may be delayed by the API; UI messages this instead of showing an empty state.

**US-B2 · Import chess.com archives** — *Must, P2*
- Monthly archives fetched via backend proxy, **serially** (no parallel requests per user), with caching: past months cached immutably, current month with a short TTL.
- Games normalized into the same internal model as Lichess games (PGN → moves, clocks if present, ratings, result).

**US-B3 · Filter & select games** — *Should, P1*
- Filter by time control, color, result; sort by date. Selecting a game opens the analysis flow.

---

### Epic C — Engine analysis

**US-C1 · Client-side Stockfish analysis** — *Must, P0*
> As a player, I want my game analyzed in my browser so that analysis is fast and free.

Acceptance criteria:
- Stockfish **NNUE WASM** runs in a **Web Worker**; multithreading enabled when `crossOriginIsolated === true` (site must ship **COOP/COEP headers** — infra requirement FR-7).
- Per-position budget: **depth ≥ 18 or ≥ 1M nodes**, whichever is reached first; full game (~40 moves) completes in **≤ 45 s** on 2020+ mid-range hardware.
- Progress indicator shows per-move progress; analysis is cancelable; results are cached (re-opening a game never re-analyzes).
- Feature detection: if WASM threads/SIMD unavailable, fall back to single-threaded engine with adjusted expectations messaging.

**US-C2 · Reuse existing evals** — *Should, P1*
- If a Lichess game already includes server evals, those positions skip local engine work (evals marked with provenance: `lichess-server` / `local-engine` / `cloud`).

**US-C3 · Cloud fallback for weak devices** — *Could, P2*
- Low-power device detection routes analysis to Lichess cloud-eval endpoint (respecting its limits) or our own eval service; provenance recorded; this path is a candidate premium feature ("deep cloud analysis").

**US-C4 · Move classification** — *Must, P0*
> As a player, I want every move labeled (blunder, mistake, inaccuracy, good, great, brilliant-type) so that I can see at a glance where the game turned.

Acceptance criteria:
- Deterministic classifier (same input → same output) based on **win-probability deltas** (preferred over raw centipawns at extreme evals), with documented thresholds; reference implementation may follow the open-source WintrChess/freechess logic, **re-implemented** in our codebase.
- Categories: Best / Great / Good / Book / Inaccuracy / Mistake / Blunder / Missed win / Brilliant-type sacrifice detection.
- **Original naming and icon set** — must not copy chess.com's glyph designs or exact badge branding (legal requirement NFR-L2).
- Unit-tested against a curated fixture set of **≥ 50 positions** with expected labels; CI-gated.

---

### Epic D — AI coaching report

**US-D1 · Plain-language game summary** — *Must, P0*
> As a player, I want a short human-readable summary of my game so that I understand what happened without reading engine lines.

Acceptance criteria:
- LLM input is **only structured engine output**: FEN per position, move played, top-k engine moves with evals, eval delta, game phase, motif tags, player ratings, and per-move clock times when available. The prompt never asks the model to evaluate a position.
- Summary ≤ **250 words**, tone adapted to rating band (< 1200 / 1200–1800 / > 1800) — e.g., no deep theory jargon for beginners.
- **Grounding validator**: after generation, every move/square reference in the text is checked against the actual game and engine PVs; on mismatch the report is regenerated once, then offending sentences are stripped. Hallucinated moves must never render.
- LLM step completes in **≤ 10 s** after engine phase; cost per full report **≤ $0.02** at default model (provider-agnostic abstraction, see FR-4).
- If the LLM provider is down: engine-only report renders (classifications, eval graph, key moments without prose) + "AI summary pending" retry state. Never a blank page.

**US-D2 · Key moments** — *Must, P0*
- 3–5 critical positions auto-selected (largest win-probability swings, missed tactics, decisive mistakes).
- Each moment: interactive board, arrow for played move vs best move, 2–3 sentence grounded explanation, and the engine line expandable on demand.

**US-D3 · "What to work on" recommendations** — *Should, P1*
- ≤ 3 actionable recommendations derived from this game's classified mistakes and motif tags (e.g., "You lost material to knight forks twice — practice fork-spotting"). Each links back to the supporting moment(s). No generic filler advice.

**US-D4 · Shareable report link** — *Could, P2*
- Public read-only URL per report; contains usernames + game data only (already public); `noindex` by default; owner can disable the link.

---

### Epic E — Weakness dashboard (main paid feature)

**US-E1 · Cross-game statistics** — *Must, P1*
> As a returning player, I want stats across my last 25–100 games so that I can see my patterns, not just one game.

Acceptance criteria:
- Aggregates over selectable window (25 / 50 / 100 games): accuracy trend, blunder rate by phase (opening / middlegame / endgame), results by opening (ECO), by color, by time control.
- **Time-trouble indicator**: correlation of mistakes with low clock (where clock data exists).
- Minimum-sample rule: any stat with n < 10 shows "not enough games yet" instead of a misleading number.
- Dashboard loads ≤ 3 s from cached aggregates (no re-analysis on view).

**US-E2 · Recurring-weakness detection** — *Should, P1*
- Top 3 weakness tags (e.g., "hanging pieces in the middlegame", "endgame conversion", "time trouble"), each backed by **≥ 5 concrete linked game examples**; detection methodology documented in the repo so it's explainable, not a black box.

**US-E3 · Progress over time** — *Should, P2*
- Trend charts comparing current window vs previous window; celebratory state when a weakness measurably improves (retention hook).

---

### Epic F — Free tier, billing & entitlements

**US-F1 · Free-tier limits** — *Must, P1*
- Free: **3 AI-narrated reports per day** (config-flag), unlimited engine-only analysis (costs us nothing). Paid: unlimited reports + dashboard + recommendations history.
- Limits enforced **server-side** (LLM calls are server-mediated); remaining quota visible in UI; resets 00:00 UTC.

**US-F2 · Subscription checkout** — *Must, P1*
- Provider: **Paddle or Stripe** — team to confirm; Paddle preferred as merchant-of-record to offload **EU VAT** handling (we are EU-based). Prices config-driven; placeholders: **$6.99/mo, $49/yr**.
- Self-serve upgrade / cancel / payment-method change; webhooks drive entitlement state; failed payment → 7-day grace period before downgrade; invoices/VAT handled by provider.

**US-F3 · Entitlement service** — *Must, P1*
- Single source of truth for plan state, consumed by API gateway; changes propagate ≤ 1 min; all gated endpoints check entitlements server-side (client checks are cosmetic only).

---

### Epic G — Game viewer UI

**US-G1 · Interactive board & report layout** — *Must, P0*
- Move list synced with board; keyboard ← → navigation; eval graph over the game; classification badges per move; engine line viewer on demand.
- Responsive down to **360 px** width (many users are mobile-web).
- Open-licensed piece set (e.g., Lichess's cburnett, with license attribution page) — **not** chess.com assets.

---

## 6. Cross-cutting functional requirements

- **FR-1 chess.com proxy:** all Published-Data API traffic goes through our backend with custom `User-Agent` (app name + contact email); serial requests per user; global concurrency cap; exponential backoff on 429/403; responses cached (immutable past months).
- **FR-2 Lichess client:** respect rate limits; on 429 wait ≥ 60 s before one retry; use official recommendations (NDJSON streaming for exports).
- **FR-3 Idempotent analysis:** game analysis and report generation are idempotent jobs keyed by game ID + engine/prompt version; safe to retry.
- **FR-4 LLM provider abstraction:** single interface with pluggable providers (e.g., GPT-4o-mini-class default, premium model for paid tier behind a flag); **prompt + model version stored with every report** for reproducibility and debugging.
- **FR-5 Job queue:** LLM calls and cloud-eval jobs run through a queue (Redis-based) with retries + jitter; user-facing status via polling or SSE.
- **FR-6 Telemetry:** privacy-respecting product analytics for the activation funnel (username submitted → analysis done → report viewed → signup → payment). No third-party ad trackers.
- **FR-7 Hosting headers:** site served with **COOP/COEP** so `SharedArrayBuffer`/threads work for WASM Stockfish; verified by an automated smoke test.
- **FR-8 Feature flags:** tier limits, model selection, and phase-2 features behind flags.

---

## 7. Non-functional requirements

**Performance**
- NFR-P1: landing page TTI < 3 s on 4G mid-range mobile; Core Web Vitals "good".
- NFR-P2: full single-game pipeline (fetch → engine → LLM → render) ≤ 60 s p75 on 2020+ hardware.

**Security**
- NFR-S1: HTTPS everywhere; OAuth tokens and email addresses encrypted at rest; secrets in a managed vault, never in the repo.
- NFR-S2: OWASP Top-10 hygiene; dependency scanning in CI; server-side validation of all identifiers (usernames, game IDs).

**Privacy / GDPR (we are EU-based, users are worldwide)**
- NFR-PR1: EU-region hosting preferred; DPA in place with the LLM provider; game data sent to the LLM contains only public game info (no emails).
- NFR-PR2: consent-based analytics; privacy policy + ToS pages required before launch (also mandatory later for Chrome Web Store).
- NFR-PR3: deletion & export per US-A4.

**Reliability**
- NFR-R1: report success rate ≥ 99%; engine-only degradation path when LLM is unavailable (US-D1).
- NFR-R2: third-party API failures (Lichess/chess.com down) produce clear user-facing states, never blank screens.

**Compatibility & accessibility**
- NFR-C1: last 2 versions of Chrome, Firefox, Safari, Edge; single-thread WASM fallback where threads are unavailable.
- NFR-C2: WCAG 2.1 AA basics — keyboard-navigable board and move list, sufficient contrast, alt text.
- NFR-C3: all UI strings externalized for future locales (EN at launch; PL and others later).

**Legal**
- NFR-L1: **no live-game assistance features, ever** (fair-play compliance) — enforced as a review checklist item on every PR touching analysis or extension code.
- NFR-L2: no chess.com IP (pieces, sounds, glyph art, badge branding); original classification icon set; open-licensed assets attributed.
- NFR-L3: **Stockfish is GPLv3**: it runs as a separate WASM artifact; an attribution + source-offer page is required; our proprietary code stays out of derivative-work scope. Any future **mobile bundling requires legal review before commitment**.

---

## 8. Reference architecture (informative)

- **Frontend:** Next.js + TypeScript; chess logic via `chess.js`/`chessops`; board component (open-source); Stockfish NNUE WASM in a Web Worker.
- **Backend:** Node (NestJS/Fastify) or Python (FastAPI); PostgreSQL (users, games, reports, aggregates); Redis (queue, rate limits, cache); server-mediated LLM calls.
- **Integrations:** Lichess OAuth + export API; chess.com Published-Data API via proxy; billing provider (Paddle/Stripe); LLM provider behind abstraction.
- **Hosting:** EU region (e.g., Hetzner/Fly/Vercel + EU DB); COOP/COEP configured at the edge.
- **Flow:** import game → normalize PGN → client engine analyzes → classifications computed → structured payload → server LLM call → grounding validator → report persisted → dashboard aggregates updated (async job).

---

## 9. Out of scope (MVP) — explicit

Live-game analysis/overlays · native mobile apps · bot play · puzzle generation · coach/B2B dashboard · other platforms (chess24 etc.) · offline mode.

---

## 10. Open questions for the team

1. Paddle vs Stripe (EU VAT as merchant-of-record vs flexibility)?
2. Final pricing (test $5.99 vs $6.99 vs $7.99/mo; annual discount level)?
3. Default LLM model + premium-tier model; token budget per report section?
4. Is engine-only analysis truly unlimited on free, or capped for abuse control?
5. Brand name + domain (affects OAuth app registration and `User-Agent` string).
6. P0 demo: Lichess-only, or include chess.com from day one (requires proxy earlier)?

---

## 11. Glossary

**PGN** — text format for recorded games · **FEN** — text encoding of a board position · **NDJSON** — newline-delimited JSON (Lichess export format) · **PV** — principal variation, the engine's best line · **NNUE** — neural-net evaluation inside Stockfish · **centipawn (cp)** — 1/100 of a pawn of advantage · **win-probability delta** — change in expected score used for move classification · **ECO** — opening classification code · **PubAPI** — chess.com Published-Data API (read-only, public) · **COOP/COEP** — HTTP headers enabling multithreaded WASM · **MoSCoW** — Must/Should/Could/Won't prioritization.
