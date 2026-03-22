#!/usr/bin/env bash
# Install claude-context-cli binary from GitHub releases.
# Detects OS and architecture, downloads the right binary.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/chrisfentiman/claude-context-cli/main/scripts/install.sh | bash

set -euo pipefail

REPO="chrisfentiman/claude-context-cli"
INSTALL_DIR="${HOME}/.local/bin"

# Detect platform
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
  darwin) PLATFORM="darwin" ;;
  linux)  PLATFORM="linux" ;;
  *)
    echo "Unsupported OS: $OS" >&2
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64|amd64)  ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

ARTIFACT="claude-context-cli-${PLATFORM}-${ARCH}"

# Get latest release tag
echo "Fetching latest release..."
LATEST=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed 's/.*"tag_name": "\(.*\)".*/\1/')

if [ -z "$LATEST" ]; then
  echo "Could not determine latest release" >&2
  exit 1
fi

URL="https://github.com/${REPO}/releases/download/${LATEST}/${ARTIFACT}"

echo "Downloading ${ARTIFACT} ${LATEST}..."
mkdir -p "$INSTALL_DIR"
curl -fsSL -o "${INSTALL_DIR}/claude-context-cli" "$URL"
chmod +x "${INSTALL_DIR}/claude-context-cli"

echo "Installed to ${INSTALL_DIR}/claude-context-cli"

# Check PATH
if [[ ":$PATH:" != *":${INSTALL_DIR}:"* ]]; then
  echo ""
  echo "Add to your PATH:"
  echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
fi

echo ""
echo "Verify: claude-context-cli --version"
