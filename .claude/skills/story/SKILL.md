---
name: story
description: >-
  Implement a PRD user story end to end, with its acceptance criteria as the definition of done.
  Use when the user says "implement US-C4", "build the demo report story", "do the next story",
  "/story US-A1", or names any US-*/FR-*/NFR-* requirement to build. Routes the work to the owning
  agent, verifies each acceptance criterion, runs the fair-play gate when relevant, and updates
  docs/progress.md.
---

# Implement a user story

Argument: a requirement ID (`US-A1`, `US-C4`, `FR-7`, …). If `$ARGUMENTS` is empty, read
`docs/progress.md` and propose the next story in milestone order — don't guess silently.

## 1. Load the spec

Read, in this order:

- The story's section in `docs/prd.md` — the story text, **every** acceptance criterion, and each
  cross-referenced `FR-*`/`NFR-*`.
- `docs/implementation-plan.md` — which milestone this belongs to, the stack decisions already
  made, and the licensing constraints (§1.2 in particular).
- `docs/progress.md` — current state, and whether anything this story depends on is still open.
- `docs/decisions.md` — decisions that already bind this work.

If the story depends on an unanswered open question (PRD §10 / plan §7), stop and ask. Building on
an assumed answer is how work gets thrown away.

## 2. Check phase

Work runs P0 → P1 → P2 → P3. If the requested story is P2/P3 while P0/P1 stories are still open,
say so and confirm before proceeding.

## 3. Restate the definition of done

Write the acceptance criteria out as a checklist, 1:1 with the PRD — this is the contract. Add
derived technical criteria only where an AC implies one (e.g. "rate-limited to 3/IP/day, enforced
server-side" implies a Redis-backed check and a test that the 4th request is refused). Do not
invent scope the PRD doesn't ask for.

## 4. Route to the owning agent

| Story touches | Agent |
|---|---|
| Engine, worker, analysis budgets, classifier, fixtures | `chess-engine` |
| Route handlers, Lichess/chess.com clients, LLM, grounding validator, limits, auth | `chess-backend` |
| Pages, board, move list, eval graph, badges, dashboard, headers, i18n, a11y | `chess-frontend` |
| Docs ambiguity, cross-cutting decision, `.claude/` assets | `chess-architect` |

A story spanning two areas is split along that boundary — each agent owns its side; don't let one
agent write another's files.

## 5. Implement

Follow the path-scoped rules in `.claude/rules/` for whatever layer is touched (they load
automatically). Tests first for anything the PRD marks CI-gated — the classifier fixture suite
(US-C4) and the COOP/COEP smoke test (FR-7). Docs-first for every library: **context7 MCP**, never
memory.

## 6. Verify

Check each AC against running code or a passing test, and record *how* it was verified. An AC that
can't be verified yet because it needs later-milestone infra is reported as **deferred** with the
milestone named — never silently skipped, never marked done.

## 7. Gate

- If the story touched analysis, import, licensing-relevant deps, or any user-facing surface, run
  **`/fairplay-check`** on the diff.
- Run the **`chess-reviewer`** agent on the diff before declaring done — fresh context, adversarial.
  Address blocking findings; report non-blocking ones.

## 8. Record

Update `docs/progress.md`: the story's state, the date, what was verified, what was deferred and
why, and anything newly blocked. If a real choice was made between options, add it to
`docs/decisions.md`. Commit messages carry the story ID (`US-C4: …`).

## Output

The AC checklist with ✅ (and how verified) / ❌ / deferred-to-milestone, the reviewer verdict, files
changed, and any question the user needs to answer before the next story.
