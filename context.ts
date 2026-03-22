/**
 * Context factory and staleness checker.
 *
 * Resolves configuration by walking the same sources Claude Code uses:
 *   1. process.env (highest priority)
 *   2. Project .mcp.json (env vars from claude-context server definition)
 *   3. .claude/.mcp.json
 *   4. ~/.claude.json (user-level MCP config)
 *   5. ~/.context/.env (claude-context global config)
 *   6. Defaults (lowest priority)
 */

import { execSync } from "child_process"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import {
  Context,
  OllamaEmbedding,
  OpenAIEmbedding,
  GeminiEmbedding,
  VoyageAIEmbedding,
  MilvusVectorDatabase,
} from "@zilliz/claude-context-core"

interface IndexState {
  timestamp: number
  commit: number
  dirtyCount: number
}

// --- Config resolution ---

interface ResolvedConfig {
  embeddingProvider: string
  embeddingModel: string | undefined
  ollamaHost: string
  milvusAddress: string
  milvusToken: string | undefined
  openaiApiKey: string
  openaiBaseUrl: string | undefined
  geminiApiKey: string
  geminiBaseUrl: string | undefined
  voyageaiApiKey: string
}

/**
 * Extract env vars from an MCP server definition named "claude-context".
 */
function extractMcpEnv(filePath: string): Record<string, string> {
  try {
    if (!existsSync(filePath)) return {}
    const content = JSON.parse(readFileSync(filePath, "utf-8"))
    const servers = content.mcpServers || {}
    const cc = servers["claude-context"]
    if (cc?.env && typeof cc.env === "object") {
      return cc.env as Record<string, string>
    }
  } catch {
    // Invalid JSON or missing file
  }
  return {}
}

/**
 * Parse a .env file into key-value pairs.
 */
function parseEnvFile(filePath: string): Record<string, string> {
  try {
    if (!existsSync(filePath)) return {}
    const content = readFileSync(filePath, "utf-8")
    const result: Record<string, string> = {}
    for (const line of content.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eqIdx = trimmed.indexOf("=")
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      // Strip quotes
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      result[key] = val
    }
    return result
  } catch {
    return {}
  }
}

/**
 * Resolve a single env var by walking the config chain.
 */
function resolveVar(
  key: string,
  sources: Record<string, string>[]
): string | undefined {
  // process.env first
  if (process.env[key]) return process.env[key]
  // Then each source in order
  for (const source of sources) {
    if (source[key]) return source[key]
  }
  return undefined
}

export function resolveConfig(cwd: string): ResolvedConfig {
  // Build source chain (project-level first, then user-level, then global)
  const sources: Record<string, string>[] = [
    extractMcpEnv(join(cwd, ".mcp.json")),
    extractMcpEnv(join(cwd, ".claude", ".mcp.json")),
    extractMcpEnv(join(homedir(), ".claude.json")),
    parseEnvFile(join(homedir(), ".context", ".env")),
  ]

  const get = (key: string) => resolveVar(key, sources)

  return {
    embeddingProvider: get("EMBEDDING_PROVIDER") || "Ollama",
    embeddingModel: get("EMBEDDING_MODEL") || get("OLLAMA_MODEL"),
    ollamaHost: get("OLLAMA_HOST") || "http://127.0.0.1:11434",
    milvusAddress: get("MILVUS_ADDRESS") || "127.0.0.1:19530",
    milvusToken: get("MILVUS_TOKEN"),
    openaiApiKey: get("OPENAI_API_KEY") || "",
    openaiBaseUrl: get("OPENAI_BASE_URL"),
    geminiApiKey: get("GEMINI_API_KEY") || "",
    geminiBaseUrl: get("GEMINI_BASE_URL"),
    voyageaiApiKey: get("VOYAGEAI_API_KEY") || "",
  }
}

// --- Staleness ---

function getStateFile(cwd: string): string {
  return join(cwd, ".claude", "context", "last-index.json")
}

function loadState(cwd: string): IndexState {
  try {
    const file = getStateFile(cwd)
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, "utf-8"))
    }
  } catch {}
  return { timestamp: 0, commit: 0, dirtyCount: 0 }
}

export function saveState(cwd: string): void {
  const file = getStateFile(cwd)
  mkdirSync(join(cwd, ".claude", "context"), { recursive: true })

  let commit = 0
  try {
    const ts = execSync("git log -1 --format=%ct 2>/dev/null", {
      cwd,
      encoding: "utf-8",
    }).trim()
    commit = parseInt(ts, 10) || 0
  } catch {}

  let dirtyCount = 0
  try {
    const status = execSync("git status --porcelain 2>/dev/null", {
      cwd,
      encoding: "utf-8",
    }).trim()
    dirtyCount = status ? status.split("\n").length : 0
  } catch {}

  writeFileSync(
    file,
    JSON.stringify({ timestamp: Date.now(), commit, dirtyCount })
  )
}

export async function isStale(cwd: string): Promise<boolean> {
  const state = loadState(cwd)
  if (state.timestamp === 0) return true

  let latestCommit = 0
  try {
    const ts = execSync("git log -1 --format=%ct 2>/dev/null", {
      cwd,
      encoding: "utf-8",
    }).trim()
    latestCommit = parseInt(ts, 10) || 0
  } catch {}
  if (latestCommit > state.commit) return true

  let dirtyCount = 0
  try {
    const status = execSync("git status --porcelain 2>/dev/null", {
      cwd,
      encoding: "utf-8",
    }).trim()
    dirtyCount = status ? status.split("\n").length : 0
  } catch {}
  if (dirtyCount !== state.dirtyCount) return true

  return false
}

// --- Context factory ---

export async function createContext(cwd?: string): Promise<Context | null> {
  const config = resolveConfig(cwd || process.cwd())

  // Check Milvus health
  const milvusHost = config.milvusAddress.split(":")[0] || "127.0.0.1"
  try {
    execSync(`curl -sf http://${milvusHost}:9091/healthz`, {
      timeout: 3000,
      stdio: "ignore",
    })
  } catch {
    console.error("[claude-context-cli] Milvus not running, skipping")
    return null
  }

  let embedding
  switch (config.embeddingProvider) {
    case "Ollama":
      embedding = new OllamaEmbedding({
        model: config.embeddingModel || "bge-m3",
        host: config.ollamaHost,
      })
      break
    case "OpenAI":
      embedding = new OpenAIEmbedding({
        apiKey: config.openaiApiKey,
        model: config.embeddingModel || "text-embedding-3-small",
        baseURL: config.openaiBaseUrl,
      })
      break
    case "Gemini":
      embedding = new GeminiEmbedding({
        apiKey: config.geminiApiKey,
        model: config.embeddingModel || "gemini-embedding-001",
        baseURL: config.geminiBaseUrl,
      })
      break
    case "VoyageAI":
      embedding = new VoyageAIEmbedding({
        apiKey: config.voyageaiApiKey,
        model: config.embeddingModel || "voyage-code-3",
      })
      break
    default:
      console.error(
        `[claude-context-cli] Unknown provider: ${config.embeddingProvider}`
      )
      return null
  }

  const vectorDatabase = new MilvusVectorDatabase({
    address: config.milvusAddress,
    ...(config.milvusToken ? { token: config.milvusToken } : {}),
  })

  return new Context({ embedding, vectorDatabase })
}
