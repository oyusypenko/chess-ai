#!/usr/bin/env bash
# PreToolUse hook for Bash: block secret exfiltration and destructive commands.
# The settings.json deny-list covers the Read tool; this covers the shell, where
# `cat .env` would otherwise slip past it. Exit 2 blocks and explains.

set -u
input=$(cat)

if command -v jq >/dev/null 2>&1; then
  cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
else
  cmd=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null)
fi
[ -z "$cmd" ] && exit 0

deny() { echo "BLOCKED: $1" >&2; exit 2; }

# Secrets — NFR-S1: secrets live in a managed vault / .env, never in context.
case "$cmd" in
  *cat*.env*|*less*.env*|*head*.env*|*tail*.env*|*strings*.env*|*grep*.env*)
    case "$cmd" in
      *.env.example*) : ;;
      *) deny "reading .env* — secrets never enter the transcript (NFR-S1). Use .env.example for the shape." ;;
    esac
    ;;
esac
case "$cmd" in
  *cat*.pem*|*cat*.key*|*cat*secrets/*|*printenv*|*"env |"*)
    deny "dumping credentials/environment — secrets never enter the transcript (NFR-S1)."
    ;;
esac

# Destructive — confirm with a human instead.
case "$cmd" in
  *"rm -rf /"*|*"rm -rf ~"*|*"rm -rf ."*)
    deny "destructive recursive delete. Narrow the path, or ask the user to run it."
    ;;
  *"git push --force"*|*"git push -f"*)
    deny "force push. Ask the user to run it themselves if it is really intended."
    ;;
  *"git reset --hard"*)
    deny "hard reset discards uncommitted work. Ask the user first."
    ;;
esac

exit 0
