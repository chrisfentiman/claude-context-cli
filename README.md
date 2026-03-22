# claude-context-cli (`ctx`)

[![License](https://img.shields.io/github/license/chrisfentiman/claude-context-cli?style=flat-square)](LICENSE)

> Auto-indexing CLI and Claude Code plugin for [@zilliz/claude-context-mcp](https://github.com/zilliztech/claude-context). Keeps your codebase index fresh automatically.

## Table of Contents

- [Problem](#problem)
- [Features](#features)
- [Install](#install)
- [Usage](#usage)
- [Configuration](#configuration)
- [Plugin Hooks](#plugin-hooks)
- [Contributing](#contributing)
- [License](#license)

## Problem

`claude-context-mcp` provides semantic code search via Milvus, but it only indexes when explicitly told to. After git pulls, code edits, or branch switches, the index goes stale and search results become incomplete.

## Features

- Automatic re-indexing on session start, after git operations, and on session end
- Staleness detection via git commit timestamps and dirty file tracking
- Incremental indexing (Merkle tree based, only changed files re-embedded)
- Config resolution matching claude-context-mcp (walks `.mcp.json` > `~/.claude.json` > `~/.context/.env`)
- Standalone CLI for manual indexing and search
- Claude Code plugin with async hooks
- Distributed via npm with native module support

## Install

### npm (recommended)

```bash
npm install -g claude-context-cli
```

This installs both `claude-context-cli` and the shorter `ctx` alias.

### Claude Code plugin

```bash
/plugin marketplace add chrisfentiman/claudesplace
/plugin install claude-context-cli
```

### From source

```bash
git clone https://github.com/chrisfentiman/ctx.git
cd ctx
npm install
npm run build
```

## Usage

```bash
# Index a codebase (incremental)
ctx index [path]

# Index only if stale (new commits or dirty files changed)
ctx index --if-stale [path]

# Force full re-index
ctx index --force [path]

# Check index status
ctx status [path]

# Semantic search
ctx search "authentication middleware" [path]
ctx search "database connection" -n 5 [path]

# Clear index
ctx clear [path]
```

If running from source, use `npx ts-node cli.ts` or `node dist/cli.js` after `npm run build`.

## Configuration

Configuration is resolved by walking the same sources as claude-context-mcp, in priority order:

1. `process.env` (highest)
2. `.mcp.json` (project-level, `claude-context` server env)
3. `.claude/.mcp.json`
4. `~/.claude.json` (user-level MCP config)
5. `~/.context/.env` (claude-context global config)
6. Defaults (lowest)

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBEDDING_PROVIDER` | `Ollama` | `Ollama`, `OpenAI`, `Gemini`, `VoyageAI` |
| `EMBEDDING_MODEL` | Provider-specific | Model name |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `nomic-embed-text` | Ollama model (overrides `EMBEDDING_MODEL`) |
| `MILVUS_ADDRESS` | `127.0.0.1:19530` | Milvus server address |
| `MILVUS_TOKEN` | -- | Milvus/Zilliz Cloud auth token |
| `OPENAI_API_KEY` | -- | Required for OpenAI provider |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Custom OpenAI-compatible endpoint |
| `GEMINI_API_KEY` | -- | Required for Gemini provider |
| `GEMINI_BASE_URL` | -- | Custom Gemini endpoint |
| `VOYAGEAI_API_KEY` | -- | Required for VoyageAI provider |

### Staleness detection

The CLI tracks index state in `.claude/context/last-index.json`:

1. Records the latest git commit timestamp and dirty file count after each index
2. On `--if-stale`, compares current git state against saved state
3. Re-indexes only if new commits exist or dirty file count changed
4. Merkle tree in `@zilliz/claude-context-core` handles file-level diffing

## Plugin Hooks

When installed as a Claude Code plugin, three hooks fire automatically:

| Hook | Event | Behavior |
|------|-------|----------|
| `SessionStart` | Session opens | `index --if-stale` (async) |
| `PostToolUse` | After Bash commands | Re-index after `git pull/merge/checkout/rebase` (async) |
| `SessionEnd` | Session closes | `index --if-stale` (async) |

All hooks are async and non-blocking.

## Prerequisites

- A running [Milvus](https://milvus.io) instance or [Zilliz Cloud](https://cloud.zilliz.com) account
- An embedding provider: [Ollama](https://ollama.ai) (default), OpenAI, Gemini, or VoyageAI
- `claude-context-mcp` configured as an MCP server

## Contributing

1. Fork the repo
2. Create your feature branch (`git checkout -b feat/something`)
3. Commit changes (`git commit -m 'feat: add something'`)
4. Push to branch (`git push origin feat/something`)
5. Open a PR

## License

[MIT](LICENSE)
