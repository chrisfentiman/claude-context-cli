#!/usr/bin/env bash
# PostToolUse hook for Bash: re-index after operations that change code on disk.
# Matches: git, gh, and svn commands that bring in external changes.
# Worktrees are ignored (ephemeral). Only the main working directory is indexed.

set -euo pipefail

INPUT="$(cat)"

CMD=""
if command -v jq &>/dev/null; then
  CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || true
fi

SHOULD_INDEX=false

# git operations that change code on disk
if echo "$CMD" | grep -qE 'git (pull|merge|rebase|checkout|clone|fetch|stash pop|stash apply|reset|switch|restore)'; then
  SHOULD_INDEX=true
fi

# gh CLI operations that change code
if echo "$CMD" | grep -qE 'gh (pr (checkout|merge)|repo (clone|sync))'; then
  SHOULD_INDEX=true
fi

# svn operations
if echo "$CMD" | grep -qE 'svn (update|switch|merge|checkout|co)\b'; then
  SHOULD_INDEX=true
fi

if [ "$SHOULD_INDEX" = true ]; then
  for p in "/opt/homebrew/bin" "$HOME/.local/bin" "/usr/local/bin"; do
    [[ -d "$p" ]] && [[ ":$PATH:" != *":$p:"* ]] && export PATH="$p:$PATH"
  done

  CWD="${CLAUDE_PROJECT_DIR:-.}"

  if command -v ctx &>/dev/null; then
    ctx index --if-stale "$CWD" &>/dev/null &
  elif command -v npx &>/dev/null; then
    npx -y claude-context-cli index --if-stale "$CWD" &>/dev/null &
  fi
fi

echo '{}'
