#!/usr/bin/env bash
# Index the codebase if stale (new commits or changed files since last index).

set -euo pipefail
cat > /dev/null  # drain stdin

for p in "/opt/homebrew/bin" "$HOME/.local/bin" "/usr/local/bin"; do
  [[ -d "$p" ]] && [[ ":$PATH:" != *":$p:"* ]] && export PATH="$p:$PATH"
done

CWD="${CLAUDE_PROJECT_DIR:-.}"

if command -v claude-context-cli &>/dev/null; then
  claude-context-cli index --if-stale "$CWD" 2>/dev/null || true
elif command -v npx &>/dev/null; then
  npx claude-context-cli index --if-stale "$CWD" 2>/dev/null || true
fi

echo '{}'
