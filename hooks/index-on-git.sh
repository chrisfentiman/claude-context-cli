#!/usr/bin/env bash
# PostToolUse hook for Bash: re-index after git pull/merge/checkout/rebase.
# Tries: binary in PATH > bun with plugin source > skip

set -euo pipefail

INPUT="$(cat)"

CMD=""
if command -v jq &>/dev/null; then
  CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null) || true
fi

case "$CMD" in
  *"git pull"*|*"git merge"*|*"git checkout"*|*"git rebase"*)
    for p in "/opt/homebrew/bin" "$HOME/.local/bin" "/usr/local/bin"; do
      [[ -d "$p" ]] && [[ ":$PATH:" != *":$p:"* ]] && export PATH="$p:$PATH"
    done

    CWD="${CLAUDE_PROJECT_DIR:-.}"
    CLI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

    if command -v claude-context-cli &>/dev/null; then
      claude-context-cli index --if-stale "$CWD" &>/dev/null &
    elif command -v bun &>/dev/null && [ -f "$CLI_DIR/cli.ts" ]; then
      bun "$CLI_DIR/cli.ts" index --if-stale "$CWD" &>/dev/null &
    fi
    ;;
esac

echo '{}'
