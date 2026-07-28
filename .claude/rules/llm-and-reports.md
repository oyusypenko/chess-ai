---
paths:
  - "src/llm/**"
  - "src/report/**"
  - "src/reports/**"
  - "src/**/prompts/**"
---

# LLM & report generation (owner: chess-backend)

Design refs: US-D1, US-D2, US-D3, FR-4, FR-5, NFR-R1, NFR-PR1 · plan §1.5.

- **Engine-first, LLM-explains — the core principle.** The prompt carries only structured engine
  output: FEN per position, move played, top-k engine moves with evals, eval delta, game phase,
  motif tags, player ratings, per-move clock times. The model narrates those facts. It never
  evaluates, ranks, or judges a position itself. A prompt containing "is this move good", "what's
  the best move", or "evaluate this position" is a bug the hard-rules hook will block.
- **Grounding validator is a hard gate, not a nicety.** After generation, every move and square
  reference in the text is checked against the actual game and the engine PVs. On mismatch:
  regenerate **once**, then strip the offending sentences. Hallucinated moves must never render.
  The validator itself needs fixture tests — including adversarial ones (plausible-but-wrong SAN,
  correct move in the wrong position, moves from the wrong game).
- **Provider abstraction (FR-4).** One interface in `src/llm/`; provider SDKs are imported nowhere
  else (hook-enforced). Store `promptVersion` + `model` with every report — a report you can't
  reproduce is a report you can't debug.
- **All calls are server-mediated.** Provider keys never appear in client-reachable code (US-F1).
- **Degradation is mandatory** (NFR-R1): if the provider is down, the engine-only report still
  renders — classifications, eval graph, key moments — plus an "AI summary pending" retry state.
  Never a blank page, never a thrown error to the user.
- **Privacy** (NFR-PR1): payloads contain only public game data. Never emails, account IDs, or
  internal identifiers.
- **Budgets are config, not literals**: summary ≤ 250 words; tone adapted to rating band
  (< 1200 / 1200–1800 / > 1800); cost ≤ $0.02 per full report at the default model. Token budgets
  and model selection sit behind feature flags (FR-8).
- Jobs are **idempotent**, keyed by `gameId + engineVersion + promptVersion` — safe to retry
  (FR-3), and they run through the queue with retries + jitter once FR-5 lands.
- Recommendations (US-D3): ≤ 3, derived from this game's classified mistakes and motif tags, each
  linking back to the supporting moment. No generic filler advice — if there's nothing specific to
  say, say less.
