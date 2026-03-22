/**
 * SEA native module loader.
 *
 * node-gyp-build checks prebuilds/ relative to process.execPath as a fallback.
 * This loader extracts native .node assets from the SEA to that location
 * so tree-sitter modules load normally.
 *
 * When running normally (not SEA), this is a no-op.
 */

import { existsSync, writeFileSync, mkdirSync } from "fs"
import { join, dirname } from "path"

let initialized = false

export function initSEALoader(): void {
  if (initialized) return
  initialized = true

  let sea: any
  try {
    sea = require("node:sea")
    if (sea.isSea && !sea.isSea()) return
  } catch {
    return // Not a SEA build
  }

  console.error("[sea-loader] Running as SEA, extracting native modules...")

  let keys: string[]
  try {
    keys = sea.getAssetKeys()
  } catch {
    return
  }
  if (!keys || keys.length === 0) return

  // Extract prebuilds next to the binary so node-gyp-build finds them
  const execDir = dirname(process.execPath)
  console.error(`[sea-loader] execDir: ${execDir}, assets: ${keys.join(", ")}`)

  for (const key of keys) {
    if (!key.endsWith(".node")) continue

    const extractPath = join(execDir, key)
    if (!existsSync(extractPath)) {
      const data = sea.getRawAsset(key)
      const bytes = new Uint8Array(data)
      try {
        mkdirSync(dirname(extractPath), { recursive: true })
        writeFileSync(extractPath, bytes)
      } catch {
        // Can't write next to binary (read-only fs), try temp dir
        const tmpPath = join(require("os").tmpdir(), "claude-context-cli", key)
        mkdirSync(dirname(tmpPath), { recursive: true })
        writeFileSync(tmpPath, bytes)
      }
    }
  }
}
