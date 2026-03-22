#!/usr/bin/env bash
# Build a Node.js Single Executable Application (SEA) with native modules.
#
# Strategy:
# 1. esbuild bundles the app into a single CJS file
# 2. A wrapper script (sea-wrapper.js) is the SEA main entry point
# 3. The wrapper extracts native .node prebuilds from SEA assets to disk
# 4. Then loads and executes the bundled app via Module._compile
# 5. node-gyp-build finds the extracted prebuilds next to process.execPath
#
# Usage: ./scripts/build-sea.sh [output-name]
# Output: ./dist/<output-name>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_NAME="${1:-claude-context-cli}"
DIST_DIR="./dist"
BUNDLE="$DIST_DIR/bundle.js"
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
# Don't use --loader:.node=empty — node-gyp-build dynamically loads .node files
# via require(resolvedPath) which goes through process.dlopen, not static imports.
# esbuild will warn about .node files but they're never statically imported.
npx esbuild cli.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile="$BUNDLE" \
  --define:process.versions.bun=undefined

echo "==> Step 2: Collect native .node bindings for ${PLATFORM}-${ARCH}..."
# Start with the bundle itself as an asset
ASSETS_JSON="\"bundle.js\": \"$BUNDLE\""

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
    ASSETS_JSON="$ASSETS_JSON, \"$ASSET_KEY\": \"$BINDING_FILE\""
  else
    echo "   Skipping: $mod (no native binding for ${PLATFORM}-${ARCH})"
  fi
done

echo "==> Step 3: Generate SEA config..."
# The wrapper is the main entry point — it extracts assets then loads the bundle
cat > "$DIST_DIR/sea-config.json" <<EOF
{
  "main": "$SCRIPT_DIR/sea-wrapper.js",
  "output": "$BLOB",
  "disableExperimentalSEAWarning": true,
  "useCodeCache": true,
  "assets": { $ASSETS_JSON }
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
