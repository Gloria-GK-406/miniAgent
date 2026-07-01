# CLI

The built-in CLI provides an interactive REPL with rich features.

## Quick Start

```bash
npm run chat
```

On first run, a `.cliagent/config.json` template is generated. Configure your models:

```json
{
  "providers": [
    {
      "name": "anthropic-main",
      "engine": "anthropic",
      "apiKey": "sk-ant-..."
    },
    {
      "name": "local-qwen",
      "engine": "openai-compatible",
      "apiKey": "local",
      "baseUrl": "http://localhost:8000/v1",
      "models": {
        "add": [
          {
            "model": "qwen3-coder",
            "contextSize": 128000,
            "maxOutputTokens": 32768,
            "thinkingLevels": ["none", "medium"]
          }
        ]
      }
    }
  ],
  "defaultModel": "anthropic-main/claude-sonnet-4-5",
  "generation": {
    "temperature": 0.7,
    "thinking": "medium"
  },
  "systemPrompt": "You are a helpful assistant.",
  "subagent": {
    "path": "./.cliagent/subagent/"
  }
}
```

## Commands

| Command | Description |
|---------|-------------|
| `/models` | List resolved provider/model ids |
| `/model <provider/model>` | Switch active model by resolved id |
| `/tools` | List registered tools |
| `/history [page]` | View conversation history |
| `/context` | Preview context sent to LLM |
| `/compress` | Trigger context compression |
| `/session` | List all sessions |
| `/session new` | Create a new session |
| `/session switch <id>` | Switch to a session |
| `/session delete <id>` | Delete a session |
| `/session rename <id> <name>` | Rename a session |
| `/hitl [on\|off]` | Toggle human-in-the-loop |
| `/clear` | Clear current conversation |
| `/system <text>` | Update system prompt |
| `/help` | Show help |
| `/quit` | Exit |

## Built-in Tools

The CLI agent comes pre-configured with the following tools from the shared blueprint:

- **read** — Read files and directories
- **write** — Write files
- **edit** — Edit files with exact string replacement
- **glob** — Find files by pattern
- **grep** — Search file contents
- **bash** — Execute shell commands
- **todo** — Task management (todo_create, todo_update, todo_delete)
- **subagent** — Delegate tasks to sub-agents
- **mcp** — Connect to MCP servers
- **skill** — Load skill instructions

## HITL (Human-in-the-Loop)

By default, HITL is enabled. Use `/hitl off` to auto-approve all tool calls. The following tools are always auto-approved:

- `read`
- `glob`
- `grep`

## Context Compression

The CLI uses `ContextCompressor` with the following defaults:

- `maxMessages`: 60
- `keepRecent`: 15

Use `/compress` to manually trigger compression.

## Model Configuration

Models are resolved from provider profiles and engine model catalogs in `.cliagent/config.json`.

| Field | Required | Description |
|-------|----------|-------------|
| `providers[].name` | Yes | User-facing provider/profile name, used in resolved model ids |
| `providers[].engine` | Yes | Engine adapter (`anthropic`, `openai`, `openai-compatible`, `glm`, `glm-codeplan`, `nvidia`) |
| `providers[].apiKey` | Yes | API key |
| `providers[].baseUrl` | No | Custom base URL, usually for `openai-compatible` |
| `providers[].models.add` | No | Custom model presets for endpoints without a built-in catalog |
| `providers[].models.override` | No | Per-provider overrides for engine-provided presets |
| `defaultModel` | No | Resolved model id such as `anthropic-main/claude-sonnet-4-5` |
| `generation.temperature` | No | Default `0.7` |
| `generation.thinking` | No | `none`, `low`, `medium`, `high`, or `max`; unsupported levels downgrade inside the engine |

Legacy top-level `models` entries still load during migration. Their generation fields are converted into generation config, and `/model` switches keep legacy per-model generation settings when no top-level `generation` is configured.
