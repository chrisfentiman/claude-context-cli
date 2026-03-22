/**
 * SEA native module loader.
 *
 * When running as a Node.js Single Executable Application, native .node
 * modules are embedded as assets. This loader extracts them to a temp
 * directory and patches require() to find them.
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
  let sea: { getRawAsset: (key: string) => ArrayBuffer; getAssetKeys: () => string[] }
  try {
    sea = require("node:sea")
  } catch {
    // Not a SEA build, nothing to do
    return
  }

  const keys = sea.getAssetKeys()
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

  // Patch Module._resolveFilename to check our extract dir for .node files
  const Module = require("module")
  const originalResolve = Module._resolveFilename
  Module._resolveFilename = function (request: string, ...args: unknown[]) {
    // If requesting a tree-sitter module, check our extract dir
    const assetKey = `${request}.node`
    const extractPath = join(extractDir, assetKey)
    if (existsSync(extractPath)) {
      return extractPath
    }
    return originalResolve.call(this, request, ...args)
  }
}
