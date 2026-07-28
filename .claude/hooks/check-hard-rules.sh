#!/usr/bin/env bash
# ChessCoach AI hard-rule enforcement (CLAUDE.md / docs/prd.md).
# PostToolUse hook for Write|Edit|MultiEdit: greps the just-written file for
# violations of the non-negotiables. Exit 2 blocks the result and feeds the
# message back to the agent; exit 0 passes. High-precision rules only —
# anything fuzzy belongs in /fairplay-check or /spec-check, not here.

set -u
input=$(cat)

if command -v jq >/dev/null 2>&1; then
  file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
else
  file=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null)
fi
[ -z "$file" ] && exit 0
[ -f "$file" ] || exit 0

# Docs and .claude assets discuss the rules — never enforce on them.
case "$file" in
  *.md|*/docs/*|*/.claude/*|*README*|*.lock|*/node_modules/*) exit 0 ;;
esac

fail=0
err() { echo "SPEC VIOLATION: $1" >&2; fail=1; }

# ---------------------------------------------------------------- NFR-L3: GPL
# chessground / chessops (GPL-3.0) and WintrChess code must never enter the
# bundle — they would put our proprietary frontend into derivative-work scope.
case "$file" in
  */package.json|package.json)
    if grep -qE '"(chessground|chessops|@?[a-z-]*/?chessground)"[[:space:]]*:' "$file"; then
      err "GPL-3.0 dependency (chessground/chessops) in $file — bundling it makes our frontend GPL (NFR-L3). Use chess.js (BSD) + react-chessboard (MIT); see docs/implementation-plan.md §1.2."
    fi
    ;;
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
    if grep -qE "from ['\"](chessground|chessops)" "$file" || grep -qE "require\(['\"](chessground|chessops)" "$file"; then
      err "import from GPL-3.0 package (chessground/chessops) in $file — forbidden in our bundle (NFR-L3). Use chess.js + react-chessboard."
    fi
    ;;
esac

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)

    # ------------------------------------------- NFR-L1: post-game analysis only
    # Live-game surfaces are a hard product line: they get users banned and the
    # product removed. Any streaming/ongoing-game handle is a violation.
    if grep -qiE '\b(streamIncomingGame|boardStreamGameState|api/board/game/stream|/api/stream/game|liveGameEval|ongoingGame|inProgressGame|analyzeLiveGame)\b' "$file"; then
      err "live-game surface in $file — post-game analysis ONLY (NFR-L1). Never subscribe to or analyze an in-progress game."
    fi
    # NOTE: "is this game finished?" is deliberately NOT grepped here — `status === "started"`
    # is equally the shape of a correct *rejection* check. Fuzzy by nature → /fairplay-check.

    # ------------------------------------- US-D1: engine-first, LLM never evals
    if grep -qiE '(is|was) (this|the) move (good|bad|best)|evaluate this position|what.{0,10}s the best move|rate this position|assess the position' "$file"; then
      err "prompt asks the LLM to evaluate a position in $file — the LLM only narrates engine output, it never evaluates (US-D1, engine-first principle)."
    fi

    # --------------------------------- US-F1 / NFR-S1: server-side enforcement
    case "$file" in
      *server*|*api/*|*route.ts|*.server.ts|*/lib/server/*) : ;;
      *)
        if grep -qE '\b(ANTHROPIC_API_KEY|OPENAI_API_KEY|LLM_API_KEY)\b' "$file"; then
          err "LLM provider key referenced in client-reachable file $file — all LLM calls are server-mediated (US-F1, NFR-S1)."
        fi
        ;;
    esac

    # ---------------------------- FR-4: provider SDKs stay behind the interface
    case "$file" in
      */src/llm/*) : ;;
      *)
        if grep -qE "from ['\"](@anthropic-ai/sdk|openai)['\"]" "$file"; then
          err "provider SDK imported outside src/llm/ in $file — go through the provider abstraction (FR-4)."
        fi
        ;;
    esac

    # ------------------------------- FR-1: chess.com PubAPI is backend-proxy only
    case "$file" in
      */src/chesscom/*|*server*|*api/*|*route.ts|*.server.ts) : ;;
      *)
        if grep -qE 'api\.chess\.com' "$file"; then
          err "direct chess.com API call in client-reachable file $file — all PubAPI traffic goes through the backend proxy with our custom User-Agent (FR-1)."
        fi
        ;;
    esac

    # ------------------------------------------- US-C4: deterministic classifier
    case "$file" in
      */classifier/*|*/classification/*)
        if grep -qE '\bMath\.random\b|\bDate\.now\b|new Date\(\)' "$file"; then
          err "nondeterminism (Math.random/Date) in classifier file $file — same input must always produce the same label (US-C4)."
        fi
        ;;
    esac
    ;;
esac

# ------------------------------------------------------- NFR-L2: no chess.com IP
if grep -qiE 'chess\.com.{0,20}(piece|sound|glyph|badge|icon)|(brilliant|great move)\.svg|chesscom-(pieces|sounds|glyphs)' "$file"; then
  err "possible chess.com asset/branding reference in $file — no chess.com pieces, sounds, glyph art, or badge branding (NFR-L2). Our classification names and icons are originals."
fi

[ "$fail" -ne 0 ] && exit 2
exit 0
