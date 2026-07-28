---
paths:
  - "**/*.md"
---

# Docs placement — one home per kind of document

The sanctioned set under `docs/`:

| File | What it is | Who edits it |
|---|---|---|
| `docs/prd.md` | Product requirements + user stories — **what** to build. Authority doc. | Humans; agents propose diffs |
| `docs/implementation-plan.md` | Research, stack decisions, milestones — **how** and in what order. Authority doc. | chess-architect |
| `docs/progress.md` | **The single progress tracker.** Milestone/story state, what's next, blockers. | `/progress` skill, any agent finishing work |
| `docs/decisions.md` | Numbered, dated decision log for anything the authority docs left open. | chess-architect |
| `docs/attribution.md` | Stockfish GPLv3 notice + source offer, cburnett pieces, all open-licensed assets. Legally required before launch (NFR-L3, NFR-L2). | chess-architect |

Rules:

- **`docs/progress.md` is the only tracker.** Never create `PLAN.md`, `STATUS.md`, `TODO.md`,
  `NOTES.md`, `ROADMAP.md`, or dated status files anywhere in the repo — put the content in
  `docs/progress.md` (state) or `docs/decisions.md` (choices). Scratch work goes in the session
  scratchpad, not the repo.
- The repo root holds only `README.md` and `CLAUDE.md`. Everything else is under `docs/` or
  colocates as a per-directory `CLAUDE.md` (loaded when working in that subtree).
- **Requirements are not restated.** `CLAUDE.md` and the rules *point at* `docs/prd.md` — they
  don't paraphrase acceptance criteria, which is how the two drift apart. One fact, one home.
- A decision recorded nowhere is a decision that will be re-litigated. If you chose between real
  options, it goes in `docs/decisions.md` with the date, the alternatives, and the reason.
- Docs edits that change what the product does need the story/requirement ID in the commit message,
  same as code.
