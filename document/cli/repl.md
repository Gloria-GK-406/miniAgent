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
      "engine": "anthropic",
      "key": "sk-ant-...",
      "models": [{ "id": "sonnet", "name": "claude-sonnet-4-5" }]
    },
    {
      "engine": "openai-compatible",
      "key": "local",
      "baseURL": "http://localhost:11434/v1",
      "models": [{ "id": "local", "name": "qwen2.5-coder" }]
    }
  ],
  "defaultModel": "sonnet",
  "generation": {
    "temperature": 0.7,
    "thinking": "medium"
  }
}
```

## Commands

| Command | Description |
|---------|-------------|
| `/models` | List resolved model ids |
| `/model <id\|provider/id>` | Switch active model by resolved id |
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

Models are resolved from provider entries in `.cliagent/config.json`.

| Field | Required | Description |
|-------|----------|-------------|
| `providers[].engine` | Yes | Engine adapter (`anthropic`, `openai`, `openai-compatible`, `glm`, `glm-codeplan`, `nvidia`) |
| `providers[].key` | Yes | API key |
| `providers[].baseURL` | No | Custom base URL, usually for `openai-compatible` |
| `providers[].models` | Yes | Model preset array |
| `providers[].models[].id` | Yes | Selector id used by `/model` and `defaultModel` |
| `providers[].models[].name` | Yes | Provider model name sent to the engine |
| `defaultModel` | No | Model id such as `sonnet`, or `provider/id` when ambiguous |
| `generation.temperature` | No | Default `0.7` |
| `generation.thinking` | No | `none`, `low`, `medium`, `high`, or `max`; unsupported levels downgrade inside the engine |
