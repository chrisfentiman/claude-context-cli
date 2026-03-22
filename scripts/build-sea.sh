#!/usr/bin/env bash
# Build a Node.js Single Executable Application (SEA) with native modules.
#
# Usage: ./scripts/build-sea.sh [output-name]
# Output: ./dist/<output-name>

set -euo pipefail

OUTPUT_NAME="${1:-claude-context-cli}"
DIST_DIR="./dist"
BUNDLE="$DIST_DIR/bundle.cjs"
BLOB="$DIST_DIR/sea-prep.blob"
BINARY="$DIST_DIR/$OUTPUT_NAME"

mkdir -p "$DIST_DIR"

echo "==> Step 1: Bundle TypeScript to single CJS file..."
# Bundle everything — tree-sitter JS is included, only .node binaries are loaded at runtime via SEA assets
npx esbuild cli.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile="$BUNDLE" \
  --loader:.node=file

echo "==> Step 2: Collect native .node bindings..."
# Find all tree-sitter prebuilt binaries for the current platform
ASSETS_JSON="{"
ASSET_REQUIRES=""
ASSET_COUNT=0

for mod in tree-sitter tree-sitter-c-sharp tree-sitter-cpp tree-sitter-go \
           tree-sitter-java tree-sitter-javascript tree-sitter-python \
           tree-sitter-rust tree-sitter-scala tree-sitter-typescript; do
  # node-gyp-build puts prebuilds in prebuilds/<platform>-<arch>/
  PREBUILD_DIR="node_modules/$mod/prebuilds"
  BINDING_FILE=""

  # Check for prebuild
  if [ -d "$PREBUILD_DIR" ]; then
    BINDING_FILE=$(find "$PREBUILD_DIR" -name "*.node" 2>/dev/null | head -1)
  fi

  # Check for build/Release
  if [ -z "$BINDING_FILE" ] && [ -d "node_modules/$mod/build/Release" ]; then
    BINDING_FILE=$(find "node_modules/$mod/build/Release" -name "*.node" 2>/dev/null | head -1)
  fi

  if [ -n "$BINDING_FILE" ]; then
    echo "   Found: $mod -> $BINDING_FILE"
    if [ "$ASSET_COUNT" -gt 0 ]; then
      ASSETS_JSON="$ASSETS_JSON,"
    fi
    ASSETS_JSON="$ASSETS_JSON \"${mod}.node\": \"$BINDING_FILE\""
    ASSET_COUNT=$((ASSET_COUNT + 1))
  else
    echo "   Skipping: $mod (no native binding found)"
  fi
done

ASSETS_JSON="$ASSETS_JSON }"

echo "==> Step 3: Generate SEA config..."
cat > "$DIST_DIR/sea-config.json" <<EOF
{
  "main": "$BUNDLE",
  "output": "$BLOB",
  "disableExperimentalSEAWarning": true,
  "useCodeCache": true,
  "assets": $ASSETS_JSON
}
EOF

echo "==> Step 4: Generate SEA blob..."
node --experimental-sea-config "$DIST_DIR/sea-config.json"

echo "==> Step 5: Create executable..."
cp "$(command -v node)" "$BINARY"
chmod 755 "$BINARY"

# Remove code signature on macOS (required before injection)
if [[ "$(uname)" == "Darwin" ]]; then
  codesign --remove-signature "$BINARY" 2>/dev/null || true
fi

echo "==> Step 6: Inject blob..."
npx postject "$BINARY" NODE_SEA_BLOB "$BLOB" \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  --macho-segment-name NODE_SEA

# Re-sign on macOS
if [[ "$(uname)" == "Darwin" ]]; then
  codesign --sign - "$BINARY" 2>/dev/null || true
fi

echo "==> Done: $BINARY"
"$BINARY" --help
