#!/usr/bin/env bash
# Build a Node.js Single Executable Application (SEA) with native modules.
#
# Strategy: node-gyp-build checks prebuilds/ next to process.execPath as a fallback.
# So we extract the prebuilds alongside the binary at runtime via the SEA loader.
#
# Usage: ./scripts/build-sea.sh [output-name]
# Output: ./dist/<output-name>

set -euo pipefail

OUTPUT_NAME="${1:-claude-context-cli}"
DIST_DIR="./dist"
BUNDLE="$DIST_DIR/bundle.cjs"
BLOB="$DIST_DIR/sea-prep.blob"
BINARY="$DIST_DIR/$OUTPUT_NAME"

PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  aarch64) ARCH="arm64" ;;
esac

mkdir -p "$DIST_DIR"

echo "==> Step 1: Bundle TypeScript to single CJS file..."
npx esbuild cli.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile="$BUNDLE" \
  --loader:.node=empty

echo "==> Step 2: Collect native .node bindings for ${PLATFORM}-${ARCH}..."
ASSETS_ARGS=""

for mod in tree-sitter tree-sitter-c-sharp tree-sitter-cpp tree-sitter-go \
           tree-sitter-java tree-sitter-javascript tree-sitter-python \
           tree-sitter-rust tree-sitter-scala tree-sitter-typescript; do

  BINDING_FILE=""
  PREBUILD_DIR="node_modules/$mod/prebuilds/${PLATFORM}-${ARCH}"

  if [ -d "$PREBUILD_DIR" ]; then
    BINDING_FILE=$(find "$PREBUILD_DIR" -name "*.node" 2>/dev/null | head -1)
  fi

  if [ -z "$BINDING_FILE" ] && [ -d "node_modules/$mod/build/Release" ]; then
    BINDING_FILE=$(find "node_modules/$mod/build/Release" -name "*.node" 2>/dev/null | head -1)
  fi

  if [ -n "$BINDING_FILE" ]; then
    ASSET_KEY="prebuilds/${PLATFORM}-${ARCH}/$(basename "$BINDING_FILE")"
    echo "   Found: $mod -> $BINDING_FILE (asset: $ASSET_KEY)"
    ASSETS_ARGS="$ASSETS_ARGS, \"$ASSET_KEY\": \"$BINDING_FILE\""
  else
    echo "   Skipping: $mod (no native binding for ${PLATFORM}-${ARCH})"
  fi
done

echo "==> Step 3: Generate SEA config..."
cat > "$DIST_DIR/sea-config.json" <<EOF
{
  "main": "$BUNDLE",
  "output": "$BLOB",
  "disableExperimentalSEAWarning": true,
  "useCodeCache": true,
  "assets": { ${ASSETS_ARGS#,} }
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
