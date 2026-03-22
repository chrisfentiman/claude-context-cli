#!/usr/bin/env bun
/**
 * claude-context-cli — Auto-indexing CLI for @zilliz/claude-context-mcp.
 *
 * Wraps @zilliz/claude-context-core with a CLI for indexing, searching,
 * and staleness checks. Designed to be called from Claude Code hooks
 * for automatic index maintenance.
 */

import { Command } from "commander"
import { createContext, isStale, saveState } from "./context"

const program = new Command()
  .name("claude-context-cli")
  .description("Auto-indexing CLI for claude-context-mcp")
  .version("0.1.0")

// --- index ---
program
  .command("index")
  .description("Index a codebase (incremental via Merkle tree)")
  .argument("[path]", "Path to codebase", process.cwd())
  .option("--force", "Force full re-index", false)
  .option("--if-stale", "Only index if stale (new commits or dirty files)", false)
  .action(async (path: string, opts: { force: boolean; ifStale: boolean }) => {
    if (opts.ifStale && !opts.force) {
      const stale = await isStale(path)
      if (!stale) {
        console.error("[claude-context-cli] Index is current, skipping")
        return
      }
    }

    const ctx = await createContext()
    if (!ctx) return

    console.error(`[claude-context-cli] Indexing ${path}...`)
    try {
      const stats = await ctx.indexCodebase(path, (progress) => {
        if (progress.percentage % 20 === 0) {
          console.error(
            `  ${progress.phase} ${progress.percentage}%`
          )
        }
      })
      console.error(
        `[claude-context-cli] Done: ${stats.indexedFiles} files, ${stats.totalChunks} chunks`
      )
      saveState(path)
    } catch (err) {
      console.error(
        `[claude-context-cli] Error: ${err instanceof Error ? err.message : err}`
      )
      process.exit(1)
    }
  })

// --- status ---
program
  .command("status")
  .description("Check index status for a codebase")
  .argument("[path]", "Path to codebase", process.cwd())
  .action(async (path: string) => {
    const ctx = await createContext()
    if (!ctx) return

    const hasIndex = await ctx.hasIndex(path)
    const stale = await isStale(path)

    console.log(
      JSON.stringify(
        {
          path,
          indexed: hasIndex,
          stale,
        },
        null,
        2
      )
    )
  })

// --- search ---
program
  .command("search")
  .description("Semantic search across indexed codebase")
  .argument("<query>", "Search query")
  .argument("[path]", "Path to codebase", process.cwd())
  .option("-n, --limit <n>", "Max results", "10")
  .action(async (query: string, path: string, opts: { limit: string }) => {
    const ctx = await createContext()
    if (!ctx) return

    const hasIndex = await ctx.hasIndex(path)
    if (!hasIndex) {
      console.error(`[claude-context-cli] Not indexed: ${path}`)
      console.error("  Run: claude-context-cli index " + path)
      process.exit(1)
    }

    const results = await ctx.semanticSearch(path, query, parseInt(opts.limit))
    for (const r of results) {
      console.log(`\n${r.relativePath}:${r.startLine}-${r.endLine} (${(r.score * 100).toFixed(1)}%)`)
      console.log(r.content.substring(0, 200))
    }
  })

// --- clear ---
program
  .command("clear")
  .description("Remove index for a codebase")
  .argument("[path]", "Path to codebase", process.cwd())
  .action(async (path: string) => {
    const ctx = await createContext()
    if (!ctx) return

    await ctx.clearIndex(path)
    console.error(`[claude-context-cli] Cleared index for ${path}`)
  })

program.parse()
