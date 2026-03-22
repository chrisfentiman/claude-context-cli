#!/usr/bin/env bash
# Index the codebase if stale (new commits or changed files since last index).
# Tries: binary in PATH > bun with plugin source > skip

set -euo pipefail
cat > /dev/null  # drain stdin

for p in "/opt/homebrew/bin" "$HOME/.local/bin" "/usr/local/bin"; do
  [[ -d "$p" ]] && [[ ":$PATH:" != *":$p:"* ]] && export PATH="$p:$PATH"
done

CWD="${CLAUDE_PROJECT_DIR:-.}"
CLI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if command -v claude-context-cli &>/dev/null; then
  claude-context-cli index --if-stale "$CWD" 2>/dev/null || true
elif command -v bun &>/dev/null && [ -f "$CLI_DIR/cli.ts" ]; then
  bun "$CLI_DIR/cli.ts" index --if-stale "$CWD" 2>/dev/null || true
else
  echo "[claude-context-cli] Not found. Install: https://github.com/chrisfentiman/claude-context-cli/releases" >&2
fi

echo '{}'
