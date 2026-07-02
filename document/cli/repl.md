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

## Config Files

The CLI reads project config from `.cliagent/config.json`. It also supports a
global config for shared defaults:

- Windows: `%APPDATA%/miniagent/config.json`
- macOS/Linux with XDG: `$XDG_CONFIG_HOME/miniagent/config.json`
- macOS/Linux fallback: `~/.config/miniagent/config.json`

If both files exist, global config is loaded first and project config wins.
Arrays such as `providers` are replaced by the project value. Object fields such
as `permission`, `shell`, `editor`, and `diagnostics` are shallow-merged, so a
project file can override one setting without restating every global default.

If neither file exists, the CLI keeps the first-run behavior and creates a
project-local `.cliagent/config.json` template.

## Headless Commands

The same `miniagent` binary can run non-interactive commands for scripts,
automation, CI, and installation flows. Headless commands accept `--cwd <path>`
when they need to target a project directory. Commands marked with JSON support
also accept `--json`.

| Command | JSON | Description |
|---------|------|-------------|
| `--init [--force]` | Yes | Create `.cliagent/config.json` from the default project template |
| `--config-paths` | Yes | Print the resolved project and global config file paths without creating files |
| `--show-config` | Yes | Print the merged effective CLI config without creating missing config files |
| `--list-models` | Yes | List configured model selectors and mark the default model |
| `--list-commands` | Yes | List built-in and project custom slash commands |
| `--list-sessions` | Yes | List project sessions and mark the active session |
| `--export-session [id] --format json|markdown --output <path>` | Yes | Export a session transcript |
| `--import-session <path> [--name <name>]` | Yes | Import a JSON session export as a new session |
| `--delete-session <id>` | Yes | Delete a session; the last remaining session is protected |
| `--rename-session <id> --name <name>` | Yes | Rename a session |
| `--fork-session <id> [--name <name>]` | Yes | Copy a session into a new branch session |
| `--diagnostics` | Yes | Run configured or discovered diagnostic commands |
| `--doctor` | Yes | Run setup checks through the full runtime |
| `--print <prompt>` | Yes | Run one prompt headlessly and print the final assistant response |
| `--print --prompt-file <path>` | Yes | Read a headless prompt from a file |
| `--completion bash|zsh|fish|powershell` | No | Print a shell completion script |

Examples:

```bash
miniagent --init
miniagent --list-models --json
miniagent --list-commands --json
miniagent --print --prompt-file task.md --json
miniagent --diagnostics
miniagent --export-session --format markdown --output exports/session.md
miniagent --completion powershell
```

## Commands

| Command | Description |
|---------|-------------|
| `/activity` | Show recent tool and subagent activity |
| `/agent [build|plan]` | Show or switch the primary agent mode |
| `/auto` | Toggle auto approval for requests that are not denied |
| `/details` | Toggle expanded tool details |
| `/diagnostics` | Run configured project diagnostics |
| `/diff [path]` | Open a scrollable git diff panel |
| `/editor [initial text]` | Compose the next prompt in an external editor |
| `/git [status|log]` | Show git status or recent log |
| `/thinking` | Toggle reasoning visibility |
| `/models` | Open the model selector |
| `/model <id|provider/id>` | Switch active model by resolved id |
| `/permissions` | Show the active allow/ask/deny policy |
| `/system` | Show the base and effective system prompt |
| `/new [name]` | Create and switch to a new session |
| `/tools` | List registered tools |
| `/history` | View conversation history |
| `/context` | Preview context sent to LLM |
| `/compact` | Run context compression |
| `/sessions [new|switch|fork|rename|delete]` | Show or manage sessions |
| `/export [json|markdown] [path]` | Export the current session |
| `/import <path> [name]` | Import a JSON session export |
| `/init [--force]` | Create project `AGENTS.md` guidance |
| `/undo` | Undo the last user turn and restore file snapshots |
| `/redo` | Reapply the last undone turn when possible |
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
- **git_status**, **git_diff**, **git_log** - Read repository state.
- **git_commit** - Commit staged changes after permission approval.

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

## Git, Editor, Diagnostics

`/git status` and `/git log [limit]` open read-only git panels. `/diff [path]`
opens a scrollable unified diff panel. The agent also receives read-only git
tools plus guarded `git_commit`; the commit tool uses the `git_commit`
permission key.

`/editor [initial text]` writes a draft to a temporary file, opens the configured
editor, then submits non-empty edited content through the normal input path.
Configure it with `editor.executable`, `editor.args`, and `editor.wait`.

`/diagnostics` runs configured commands or discovers `npm run typecheck`,
`npm run lint`, and `npm test` from `package.json`. Configure it with
`diagnostics.commands` and `diagnostics.timeoutMs`.

`/activity` opens a compact timeline of recent tool and subagent-shaped tool
calls.

## Sessions And Commands

Sessions are project-local under `.cliagent/sessions`. `/new` creates and
switches to a session. `/sessions` opens the session panel, and subcommands can
create, switch, fork, rename, or delete sessions. The last remaining session is
protected from deletion.

Project custom commands live in `.cliagent/commands/*.md`. Each file name
becomes the slash command name. Optional YAML frontmatter supports
`description`, `agent`, and `model`; the Markdown body is submitted through the
normal runtime path with `{{args}}` or `$ARGUMENTS` replaced by user arguments.

## Export, Import, Undo

`/export markdown` writes a readable transcript, while `/export json` writes a
schema-validated session export. `/import` creates a new session from a JSON
export and switches to it.

Mutating workspace tools record per-turn file snapshots. `/undo` removes the
last user turn and restores files when their current content still matches the
recorded post-turn content. `/redo` reapplies the undone messages and file
state when no conflict is detected.

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
| `editor` | No | External editor executable, args, and wait preference |
| `diagnostics` | No | Project diagnostic commands and timeout |
| `tui` | No | TUI display preferences |
| `generation.temperature` | No | Default `0.7` |
| `generation.thinking` | No | `none`, `low`, `medium`, `high`, or `max`; unsupported levels downgrade inside the engine |
