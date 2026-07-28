#!/usr/bin/env bash
# PostToolUse hook for Write|Edit|MultiEdit: format the edited file with
# Prettier. Deterministic enforcement, not advice. No-ops silently until the
# toolchain is installed (M1) so it is safe from day one.

set -u
input=$(cat)

if command -v jq >/dev/null 2>&1; then
  file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
else
  file=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null)
fi
[ -z "$file" ] && exit 0
[ -f "$file" ] || exit 0

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.css|*.md) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
[ -x node_modules/.bin/prettier ] || exit 0
node_modules/.bin/prettier --write "$file" >/dev/null 2>&1 || true
exit 0
