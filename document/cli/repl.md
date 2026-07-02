# CLI

The built-in CLI provides an interactive single-process TUI for MiniAgent.

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
  "defaultAgent": "build",
  "permission": {
    "*": "ask",
    "read": "allow",
    "glob": "allow",
    "grep": "allow"
  },
  "shell": {
    "windows": "powershell",
    "timeoutMs": 120000
  },
  "tui": {
    "showReasoning": false,
    "showToolDetails": false
  },
  "generation": {
    "temperature": 0.7,
    "thinking": "medium"
  }
}
```

## Commands

| Command | Description |
|---------|-------------|
| `/agent [build|plan]` | Show or switch the primary agent mode |
| `/auto` | Toggle auto approval for requests that are not denied |
| `/details` | Toggle expanded tool details |
| `/thinking` | Toggle reasoning visibility |
| `/models` | Open the model selector |
| `/model <id|provider/id>` | Switch active model by resolved id |
| `/tools` | List registered tools |
| `/history` | View conversation history |
| `/context` | Preview context sent to LLM |
| `/sessions` | Show current session information |
| `/help` | Show help |
| `/quit` | Exit |

## Built-In Tools

The CLI runtime injects workspace-aware tools over the default blueprint where
needed:

- **read** - Read files and directories inside the workspace.
- **write** - Write workspace files after permission checks.
- **edit** - Edit workspace files with exact string replacement.
- **multi_edit** - Apply multiple exact replacements to one file atomically.
- **patch** - Apply conservative single-file unified patches.
- **glob** - Find files by pattern.
- **grep** - Search file contents.
- **shell** - Execute shell commands through the CLI shell service.
- **todo** - Task management (`todo_create`, `todo_update`, `todo_delete`).

When `.cliagent/config.json` includes `mcp`, `skill`, or `subagent` fields,
those CLI convenience fields are copied into blueprint component config during
assembly.

## Permissions

The CLI uses a product-level permission policy. Read/search tools are allowed by
default, mutating tools and shell commands ask by default, and explicit deny
rules are always enforced. `/auto` allows requests that would otherwise ask, but
it never overrides a deny rule.

## Shell

Messages beginning with `!` run through the CLI shell service and are recorded
as shell output in the conversation. On Windows the default shell is PowerShell;
the config can switch to Git Bash, WSL, cmd, or an explicit executable.

## Context Compression

The CLI uses `ContextCompressor` with the following defaults:

- `maxMessages`: 60
- `keepRecent`: 15

Compression runs as part of the assembled agent runtime.

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
| `defaultAgent` | No | `build` or `plan`; defaults to `build` |
| `permission` | No | Product-level allow/ask/deny policy |
| `shell` | No | Cross-platform shell settings |
| `tui` | No | TUI display preferences |
| `generation.temperature` | No | Default `0.7` |
| `generation.thinking` | No | `none`, `low`, `medium`, `high`, or `max`; unsupported levels downgrade inside the engine |
