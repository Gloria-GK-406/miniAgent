# CLI

The built-in CLI provides an interactive REPL with rich features.

## Quick Start

```bash
npm run chat
```

On first run, a `.cliagent/config.json` template is generated. Configure your models:

```json
{
  "models": [
    {
      "name": "claude",
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514",
      "apiKey": "sk-ant-..."
    }
  ],
  "defaultModel": "claude",
  "systemPrompt": "You are a helpful assistant.",
  "subagent": {
    "path": "./.cliagent/subagent/"
  }
}
```

## Commands

| Command | Description |
|---------|-------------|
| `/models` | List configured models |
| `/model <provider/model>` | Switch active model |
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

Models are configured in `.cliagent/config.json`. Each model entry requires:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Display name for the model |
| `provider` | Yes | Engine provider (`anthropic`, `openai`, `openai-compatible`, `glm`, `glm-codeplan`) |
| `model` | Yes | Model identifier |
| `apiKey` | Yes | API key |
| `baseUrl` | No | Custom base URL (required for `openai-compatible`) |
