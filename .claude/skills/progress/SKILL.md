---
name: progress
description: >-
  Read or update docs/progress.md, the single source of truth for project state. Use when the user
  asks "where are we", "what's the status", "what's next", "update progress", "/progress", or after
  finishing any milestone or story. Reconciles the tracker against the actual repo rather than
  trusting either alone.
---

# Progress tracker

`docs/progress.md` is the **only** tracker in this repo (docs-placement rule). Never create
`STATUS.md`, `TODO.md`, `PLAN.md`, or dated status files — they diverge within a week.

## Reading state ("where are we?")

Don't just quote the file — **reconcile it against reality** first, because a tracker nobody
verified is worse than none:

1. Read `docs/progress.md`.
2. Check the repo: `git log --oneline -15`, what exists under `src/`, whether tests run, and
   whether `package.json` reflects the claimed stack.
3. Report the current milestone, what's actually done vs claimed, what's next, and any blocker.
   **Call out drift explicitly** — "the tracker says M2 done, but `src/lichess/` doesn't exist" is
   the most useful thing this skill can produce.

## Updating state

Update after any milestone or story changes state. Keep entries factual and dated (use the real
date — the environment provides it; never invent one).

For each story/milestone record: **ID · state · date · how it was verified · what was deferred**.

States: `not started` · `in progress` · `blocked (reason)` · `done (verified how)` · `deferred (to
milestone)`. "Done" requires verification — a passing test, a working page, a measured number. Code
that exists but was never run is `in progress`.

Also update when:

- A blocker appears or clears — name it and who/what unblocks it.
- An open question gets answered — the answer goes to `docs/decisions.md`; the tracker links it.
- Scope changes — note what moved and why, don't silently rewrite history.

## What does NOT go here

- **Decisions** → `docs/decisions.md` (numbered, dated, alternatives, rationale).
- **Requirements** → `docs/prd.md`. Never restate acceptance criteria in the tracker; link the ID.
- **Plans and research** → `docs/implementation-plan.md`.
- Session scratch work → the scratchpad, not the repo.

## Output

A short status: current milestone, done / in progress / blocked / next, plus any drift you found
between the tracker and the repo. If you updated the file, say exactly what changed.
