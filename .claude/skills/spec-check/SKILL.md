---
name: spec-check
description: >-
  Audit files or the current diff against the full PRD requirement set (US-*/FR-*/NFR-*) and report
  a findings table with requirement references and severity. Use when the user says "spec check",
  "does this match the PRD", "review against requirements", "/spec-check", or wants a compliance
  audit broader than the fair-play gate. Reports only; does not fix.
---

# Spec compliance audit

Review **$ARGUMENTS** against `docs/prd.md`, `docs/implementation-plan.md`, and `CLAUDE.md`.

Scope: if `$ARGUMENTS` names files or directories, review exactly those. If empty, review
`git diff HEAD` + staged + untracked; if the tree is clean, review the last commit.

Read `CLAUDE.md`, `docs/prd.md`, and the relevant sections of `docs/implementation-plan.md` in full
first. Then check every in-scope file. Violations in copy, config, or docs count the same as code.

## Requirements to enforce (requirement → where it's specified)

**Hard lines** (also covered by `/fairplay-check` — cite both if hit)

1. Live-game assistance of any kind → NFR-L1.
2. LLM asked to evaluate a position rather than narrate engine output → US-D1, PRD §1.
3. Grounding validator bypassed, disabled, or weakened → US-D1.
4. GPL dependency in the bundle (`chessground`, `chessops`, any GPL/AGPL); Stockfish linked rather
   than loaded at runtime; missing attribution → NFR-L3.
5. chess.com pieces/sounds/glyphs/badge branding → NFR-L2.
6. Quota, rate limit, or entitlement enforced client-side → US-F1, US-F3.

**Engine & classification** 7. Per-position budget other than depth ≥ 18 / ≥ 1M nodes → US-C1. 8. Analysis on the main thread, or not cancelable, or no per-move progress → US-C1. 9. Missing thread/SIMD feature detection or a broken single-threaded fallback → US-C1, NFR-C1. 10. Results not cached by `gameId + engineVersion` (re-analysis on re-open) → US-C1, FR-3. 11. Nondeterminism in classification; centipawn-based thresholds instead of win-probability;
undocumented magic thresholds; fixture suite < 50 positions or not CI-gated → US-C4. 12. Missing eval provenance (`lichess-server`/`local-engine`/`cloud`) → US-C2.

**External APIs** 13. chess.com called from the browser; missing custom `User-Agent`; parallel per-user requests;
no immutable caching of past months → FR-1. 14. Lichess 429 not handled with ≥ 60 s wait + single retry; no NDJSON streaming; no
rate-limit user state → FR-2, US-B1. 15. External identifiers not validated server-side → NFR-S2. 16. Third-party failure producing a blank screen or raw error instead of a designed state → NFR-R2.

**Reports & LLM** 17. Provider SDK imported outside `src/llm/`; `promptVersion`/`model` not stored with the report →
FR-4. 18. No engine-only degradation path when the provider is down → US-D1, NFR-R1. 19. Summary > 250 words, or tone not adapted to rating band → US-D1. 20. Emails or account identifiers in LLM payloads → NFR-PR1. 21. Non-idempotent analysis/report jobs → FR-3.

**UI & platform** 22. Missing COOP/COEP headers or no smoke test asserting `crossOriginIsolated` → FR-7. 23. Layout broken below 360 px → US-G1. 24. Board/move list not keyboard-navigable; meaning encoded in colour alone; missing alt text →
NFR-C2. 25. Hardcoded user-facing strings (not externalized) → NFR-C3. 26. Tier limits, model selection, or phase-2 features not behind flags → FR-8.

**Process** 27. Stats with n < 10 shown as a number instead of "not enough games yet" → US-E1. 28. A real decision made silently instead of recorded in `docs/decisions.md` → spec-authority rule. 29. Progress state changed without updating `docs/progress.md`; a competing tracker file created →
docs-placement rule.

## Output

A findings table, most severe first:

| #   | File:Line | Finding | Requirement | Severity |
| --- | --------- | ------- | ----------- | -------- |

Severity: **Critical** (hard line — NFR-L1/L2/L3, hallucination reaching users, secret exposure) ·
**High** (requirement violated in code) · **Medium** (spec deviation, not a hard line) ·
**Low/Info** (drift or ambiguity worth flagging).

Then a one-line verdict (`CLEAN` or `N findings, worst: <severity>`), and a **Spec ambiguities**
list for anything the PRD leaves silent or self-contradictory — route those to `chess-architect`
for `docs/decisions.md`; do not resolve them here. Do not fix anything; this skill only reports.
