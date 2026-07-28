#!/usr/bin/env bash
#
# Project hard rules — the checks that must hold on every commit.
#
# These mirror the Claude Code write-time hook (.claude/hooks/check-hard-rules.sh)
# so the rules bind every contributor and every tool, not just one editor. CI
# and the pre-commit hook both call this file, so there is one implementation to
# keep correct rather than three that quietly disagree.
#
# Each rule cites the requirement it enforces. A check nobody can trace back to
# a decision is a check someone eventually deletes.
set -uo pipefail

failed=0

fail() {
  printf '  \033[31m✗\033[0m %s\n' "$1"
  failed=1
}

pass() {
  printf '  \033[32m✓\033[0m %s\n' "$1"
}

# --- NFR-L3 / D-01 -----------------------------------------------------------
# chessground and chessops are GPL-3.0. Either one would relicense our frontend,
# which is why the board stack is chess.js (BSD-2) + react-chessboard (MIT).
if grep -nE '"(chessground|chessops)"[[:space:]]*:' package.json >/dev/null 2>&1; then
  fail "GPL-3.0 dependency found (chessground/chessops) — NFR-L3, docs/decisions.md D-01"
else
  pass "no GPL board libraries"
fi

# --- NFR-L1 ------------------------------------------------------------------
# Post-game only. Analysing a game in progress is the line that ends the
# company, so the symbols that would implement it are banned outright.
if grep -rInE '\b(streamIncomingGame|boardStreamGameState|analyzeLiveGame|liveGameEval)\b' \
    --include='*.ts' --include='*.tsx' src/ >/dev/null 2>&1; then
  fail "live-game surface found — post-game analysis only (NFR-L1)"
else
  pass "no live-game surfaces"
fi

# --- FR-7 --------------------------------------------------------------------
# COOP/COEP are what make SharedArrayBuffer available, which is what makes the
# engine multithreaded. Losing them degrades silently: analysis just gets slow.
for f in next.config.ts public/_headers; do
  if grep -q "Cross-Origin-Opener-Policy" "$f" 2>/dev/null &&
     grep -q "Cross-Origin-Embedder-Policy" "$f" 2>/dev/null; then
    pass "COOP/COEP declared in $f"
  else
    fail "$f lost COOP/COEP — FR-7"
  fi
done

# --- NFR-S1 ------------------------------------------------------------------
# A committed secret is a leaked secret; rewriting history does not un-publish
# it. The repo is public, so this is the last gate before it is irreversible.
if git diff --cached --name-only 2>/dev/null | grep -qE '(^|/)\.env(\.|$)|\.pem$|\.p12$|id_rsa'; then
  fail "refusing to commit an env file or private key — NFR-S1"
else
  pass "no secret files staged"
fi

exit "$failed"
