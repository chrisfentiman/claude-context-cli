/**
 * SEA native module loader.
 *
 * When running as a Node.js Single Executable Application, native .node
 * modules are embedded as assets. This loader extracts them to a temp
 * directory so node-gyp-build can find them.
 *
 * When running normally (not SEA), this is a no-op.
 */

import { existsSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

let initialized = false

export function initSEALoader(): void {
  if (initialized) return
  initialized = true

  // Check if we're running as a SEA
  let isSea = false
  try {
    const sea = require("node:sea")
    isSea = sea.isSea?.() ?? true
  } catch {
    return // Not a SEA build
  }
  if (!isSea) return

  const sea = require("node:sea")
  const keys: string[] = sea.getAssetKeys()
  if (keys.length === 0) return

  // Extract native modules to temp dir
  const extractDir = join(tmpdir(), "claude-context-cli-natives")
  mkdirSync(extractDir, { recursive: true })

  for (const key of keys) {
    if (!key.endsWith(".node")) continue

    const extractPath = join(extractDir, key)
    if (!existsSync(extractPath)) {
      const data = sea.getRawAsset(key)
      writeFileSync(extractPath, new Uint8Array(data))
    }
  }

  // Patch process.dlopen to intercept native module loading
  const origDlopen = process.dlopen
  process.dlopen = function (module: any, filename: string, ...args: any[]) {
    // If the filename doesn't exist but we have a matching asset, use that
    if (!existsSync(filename)) {
      const basename = require("path").basename(filename)
      const assetPath = join(extractDir, basename)
      if (existsSync(assetPath)) {
        return origDlopen.call(this, module, assetPath, ...args)
      }
      // Also try matching by module name (tree-sitter-python.node etc)
      for (const key of keys) {
        if (key.endsWith(".node") && filename.includes(key.replace(".node", ""))) {
          const keyPath = join(extractDir, key)
          if (existsSync(keyPath)) {
            return origDlopen.call(this, module, keyPath, ...args)
          }
        }
      }
    }
    return origDlopen.call(this, module, filename, ...args)
  }
}
