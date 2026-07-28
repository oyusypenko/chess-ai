# Authority chain & docs-first (always loaded)

- **Source of truth:** `docs/prd.md` (what to build — stories `US-*`, requirements `FR-*`/`NFR-*`)
  and `docs/implementation-plan.md` (how and in what order — stack decisions, milestones, research
  findings with sources). When code and these docs disagree, the docs win. When the docs are
  silent or self-contradictory, **never self-resolve**: ask, or record the decision (numbered,
  dated, owner named for anything left open) in `docs/decisions.md`.
- **Traceability.** Every change traces to a story or requirement ID. Use the ID in commit messages
  and PR titles (`US-C4: win-probability classifier thresholds`). New behavior with no story →
  add the story to the PRD first, in the same PR; the doc diff must stand on its own.
- **Phasing.** Work runs P0 → P1 → P2 → P3 (PRD §4). Don't build P2/P3 features while P0/P1
  stories are open unless the user asks. P0 is the validation demo: no accounts, Lichess only,
  one free report, waitlist capture.
- **Progress lives in exactly one place:** `docs/progress.md`. Update it when a milestone or story
  changes state — see the `/progress` skill. Never create ad-hoc `PLAN.md`, `STATUS.md`,
  `TODO.md`, or `NOTES.md` files (docs-placement rule).
- **Docs-first for libraries.** Consult current official docs via the **context7 MCP**
  (`resolve-library-id` → `get-library-docs`) before touching any library or API — never code from
  memory. WebFetch of the canonical page is the fallback. This matters more than usual here: the
  Stockfish WASM bootstrap, UCI options, Lichess NDJSON export params, and chess.com PubAPI
  headers all have version-specific details that memory gets wrong. External docs beat
  assumptions; our design docs beat external docs (flag the conflict rather than silently
  following either).
- **Open questions** (PRD §10, plan §7) are the user's to decide — billing provider, pricing,
  default LLM model, brand name, P0 scope. Where a task depends on one, ask; don't assume.
