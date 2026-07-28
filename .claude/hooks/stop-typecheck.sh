#!/usr/bin/env bash
# Stop hook: typecheck + lint the working tree before the agent finishes its
# turn — the cheap layer only (tsc --noEmit); tests stay in CI and in the
# story's definition of done. Exit 2 feeds failures back so type errors get
# fixed before stopping; stop_hook_active guards against loops. Skips silently
# until the toolchain exists (pre-M1).

set -u
input=$(cat)

if command -v jq >/dev/null 2>&1; then
  active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false')
else
  active=$(printf '%s' "$input" | python3 -c 'import json,sys; print(str(json.load(sys.stdin).get("stop_hook_active", False)).lower())' 2>/dev/null)
fi
[ "$active" = "true" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}" 2>/dev/null || exit 0

# Nothing to check until the app is scaffolded (M1).
[ -f tsconfig.json ] || exit 0
[ -d node_modules ] || exit 0

changed=$( { git diff --name-only HEAD 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null; } | grep -E '\.(ts|tsx)$' | grep -v node_modules )
[ -z "$changed" ] && exit 0

if ! out=$(npx --no-install tsc --noEmit 2>&1); then
  printf 'typecheck failed:\n%s\n' "$out" >&2
  exit 2
fi

exit 0
