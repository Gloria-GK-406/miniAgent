# Agent CLI Rewrite Design

## Goal

MiniAgent should grow a mature, commercial-quality coding-agent CLI with a
single tightly coupled TUI runtime.

The target is similar in ambition to OpenCode, but not a clone:

- No separate HTTP server process is introduced for the main TUI.
- The TUI, CLI runtime, and MiniAgent instance live in one process.
- The CLI is a product layer over MiniAgent, not a new agent core.
- MiniAgent core changes are opt-in only: this spec may identify useful core
  changes, but implementation must not modify core behavior without explicit
  approval.

## Current State

The repository already has enough core runtime to support this direction:

- `MiniAgent` supports streaming, tool calls, tool approval, events, context
  providers/processors, turn consumers/appenders, persistence, model switching,
  stop/destroy, MCP, skills, subagents, and blueprint assembly.
- The current CLI already has an Ink-based chat surface, model selection,
  session commands, history/context panels, command suggestions, and a small
  status area.
- The CLI implementation is still prototype-shaped: command handling, agent
  lifecycle, session mutation, output logging, and TUI state are concentrated
  in `src/cli/index.tsx` and `src/cli/cli-app.ts`.
- HITL is currently not product-real: the CLI tracks a HITL flag, but the CLI
  blueprint overrides approval to `allow-all`.
- Built-in tools are framework-level tools. They work, but the CLI needs safer
  workspace-aware wrappers, better permission decisions, and a cross-platform
  shell strategy.

The Python MiniAgent implementation in
`C:\Users\PXG\Documents\project\GBAPokemon` provides additional proven runtime
ideas:

- A tool can request a clean stop while still recording a paired tool result
  (`MessageStopException`).
- A turn guard can stop before another LLM call when max-turns or abort is set.
- Empty assistant replies can be nudged instead of treated as a successful
  final answer.
- Message compaction/snapshot logic avoids splitting a `ToolCall` from its
  paired `ToolResult`.

Those ideas are useful, but only the CLI-layer parts are in scope unless core
changes are separately approved.

## Product Shape

The final CLI should feel like a real coding workspace, not a command demo.
Running the CLI with no subcommand opens the TUI for the current project.

The first screen is the working agent interface:

- conversation transcript with streaming assistant output;
- collapsible reasoning blocks when models provide reasoning deltas;
- concise tool-call rows with expandable details;
- current model, agent mode, session, permission mode, token usage, and running
  state in a persistent status area;
- input with slash-command autocomplete, file-reference autocomplete, and
  shell-command affordances;
- modal/panel views for models, sessions, permissions, tools, context, history,
  diffs, help, and command palette actions.

The CLI should support two interactive primary modes:

- **Build**: full coding agent with write/edit/shell permissions subject to the
  configured permission policy.
- **Plan**: read-first planning agent. Destructive or mutating tools default to
  `ask` or `deny` depending on config.

Subagents remain MiniAgent-based and are invoked through existing subagent
plugin mechanics, but the CLI should present their execution as first-class
tool activity in the transcript.

## Non-Goals

- No separate backend/server architecture for the main TUI.
- No web UI in this spec.
- No OpenCode protocol compatibility.
- No remote share service in the first implementation tranche.
- No unapproved MiniAgent core behavior changes.
- No rewrite of LLM engine adapters unless the CLI exposes a bug.
- No broad refactor outside the CLI/product surface unless directly required.

## Architecture

The CLI should be split into a product runtime and a TUI view layer.

```text
src/cli/
  index.tsx                  process entry and argument dispatch
  runtime/
    app.ts                   CLIApp facade, lifecycle, agent rebuild
    state.ts                 serializable runtime state
    events.ts                normalized runtime events
    command-registry.ts      slash command registration/execution
    input-router.ts          user text, slash commands, @refs, !shell
    agent-factory.ts         blueprint and MiniAgent construction
    session-service.ts       session list/create/switch/fork/delete/rename
    permission-service.ts    allow/ask/deny and approval prompts
    reference-service.ts     @file lookup and turn context injection
    shell-service.ts         cross-platform shell command execution
    export-service.ts        markdown/json export/import helpers
    undo-service.ts          message/file snapshot journal
  commands/
    builtin.ts               registers built-in slash commands
    custom.ts                loads .cliagent/commands/*.md
  tools/
    cli-read.ts              workspace-aware read wrapper
    cli-write.ts             workspace-aware write wrapper
    cli-edit.ts              workspace-aware edit/multi-edit wrapper
    cli-shell.ts             shell tool wrapper
    cli-patch.ts             patch-oriented edit wrapper
    cli-toolkit.ts           default CLI tool registration
  components/
    ...                      Ink views/components
```

The exact file split can adjust during implementation, but these boundaries
are required:

- process entry parses args and mounts TUI; it should not own business logic;
- command registry owns slash-command metadata, execution, and autocomplete;
- runtime services own mutation and IO decisions;
- Ink components render state and request runtime actions;
- agent construction stays behind an `agent-factory` boundary;
- permission checks happen before mutating tool execution.

## Runtime Model

`CLIApp` is the main runtime object. It owns:

- base directory and project metadata;
- loaded CLI config;
- session service;
- current session id;
- current MiniAgent instance;
- current mode (`build` or `plan`);
- current permission policy;
- command registry;
- reference and shell services;
- normalized event stream consumed by React hooks.

The runtime exposes narrow methods for the TUI:

```ts
interface CLIAppRuntime {
    getState(): CLIState;
    subscribe(listener: (event: CLIEvent) => void): () => void;
    submitInput(input: string): Promise<void>;
    runCommand(name: string, args: string): Promise<void>;
    stop(): void;
    rebuildAgent(reason: string): Promise<void>;
    destroy(): Promise<void>;
}
```

The TUI should never call `MiniAgent.run()` directly. It sends input to the
runtime. The runtime decides whether the input is:

- a slash command;
- an external shell command (`!npm test`);
- a normal agent message;
- a normal agent message with `@file` references expanded into turn context.

## Command System

Slash commands are registered through structured metadata:

```ts
interface CLICommand {
    name: string;
    aliases?: string[];
    description: string;
    usage: string;
    hidden?: boolean;
    execute(ctx: CLICommandContext, args: string): Promise<void>;
    complete?(ctx: CLICommandContext, args: string): Promise<string[]>;
}
```

Required built-in commands:

- `/help`: show command and keybinding help.
- `/init`: create or update project `AGENTS.md` after inspecting the project.
- `/new`: create a fresh session.
- `/sessions`: list, search, switch, fork, rename, and delete sessions.
- `/model`: open model picker or switch by `provider/id`.
- `/models`: list configured/resolved models.
- `/agent`: switch between primary agents and list subagents.
- `/tools`: list tools and permission state.
- `/permissions`: inspect or edit allow/ask/deny policy.
- `/auto`: toggle auto-approval for requests not explicitly denied.
- `/details`: toggle tool detail visibility.
- `/thinking`: toggle reasoning visibility.
- `/context`: inspect context for the next LLM request.
- `/compact`: run context compression.
- `/history`: inspect session messages.
- `/export`: export current session to Markdown or JSON.
- `/import`: import a JSON session export.
- `/undo`: remove the last user turn and restore associated file snapshots.
- `/redo`: reapply an undone turn when possible.
- `/system`: inspect or update the current system prompt.
- `/quit` and `/exit`: exit the TUI.

Custom commands are loaded from:

- project: `.cliagent/commands/*.md`
- optional global: user config directory, once global config is introduced

Each command file uses frontmatter plus a Markdown prompt body:

```md
---
description: Run tests and explain failures
agent: build
model: openai/fast
---

Run the project tests. If they fail, identify the most likely cause and propose
the smallest fix.
```

Custom commands are executed by rendering the prompt body with user arguments
and submitting the result through the same runtime path as normal input.

## Input Features

### File References

Typing `@` starts fuzzy file search inside the current workspace. Selecting a
file inserts an inline reference token. On submit, the runtime resolves each
reference and injects a turn-only system/user context block with:

- absolute path;
- file size;
- selected line range if specified;
- file content up to configured limits.

References must not be persisted as permanent system context. They are turn
context for the submitted message.

Supported forms:

- `@src/core/agent.ts`
- `@src/core/agent.ts:120`
- `@src/core/agent.ts:120-180`

### Shell Shortcut

A message starting with `!` runs a shell command locally and inserts the output
into the conversation as a tool-style result. The agent is not called unless the
user asks a follow-up.

Example:

```text
!npm test
```

This should reuse the same shell runtime and permission policy as the shell
tool. Mutating or denied commands must still ask or fail according to policy.

### External Editor

`/editor` can be added after the first tranche. It opens `$EDITOR` or a
configured editor for composing long prompts. This is useful, but not required
for the first implementation tranche.

## Permissions And Approval

The CLI permission model is product-level and should not rely on the low-level
`ToolApprover` shape alone.

Policy values:

- `allow`: execute without asking;
- `ask`: show an approval prompt;
- `deny`: do not execute.

Policy can be global, tool-level, or pattern-level:

```json
{
  "permission": {
    "*": "ask",
    "read": "allow",
    "glob": "allow",
    "grep": "allow",
    "shell": {
      "*": "ask",
      "npm *": "allow",
      "git status*": "allow",
      "rm *": "deny"
    },
    "write": "ask",
    "edit": "ask"
  }
}
```

The permission service must:

- classify tool calls before execution;
- emit approval-request state for the TUI;
- resolve approval asynchronously from the user's TUI decision;
- record decisions in the transcript or runtime event log;
- enforce explicit deny even when auto mode is enabled.

The default policy:

- read/search tools: `allow`;
- write/edit/patch/shell: `ask`;
- dangerous shell patterns such as recursive remove: `deny`;
- plan mode: write/edit/patch/shell default to `ask` or `deny` depending on the
  plan-mode config, with `ask` as the interactive default.

The current CLI `allow-all` override must be removed. The default blueprint
should use a CLI approval implementation backed by `permission-service`.

## Session Model

Sessions stay project-local under `.cliagent/`.

Required session capabilities:

- list sessions sorted by update time;
- create new session;
- switch session;
- fork an existing session into a new session;
- rename session;
- delete session with last-session guard;
- persist session metadata;
- persist current model, agent mode, title, token usage, and updated time;
- export/import session data.

The current `SessionManager` may be reused or wrapped, but the CLI runtime
needs a richer session service so TUI state is not manually patched after each
operation.

Session files should remain simple and inspectable. JSONL for messages is
acceptable. Metadata should remain JSON.

## Undo / Redo And File Snapshots

Undo/redo is required for a mature coding CLI, but it should be implemented
carefully.

First tranche behavior:

- `/undo` removes the last user message and all messages after it from the
  active session.
- If mutating CLI tools were used during the removed turn, the runtime restores
  recorded file snapshots.
- `/redo` is available only when the previous undo has enough data to replay.

Snapshot policy:

- before every write/edit/patch tool mutates a file, store the previous file
  content or non-existence marker in the session journal;
- snapshots are per turn;
- restore only files touched by the undone turn;
- do not use destructive git commands for undo;
- if a file changed externally after the turn, ask before overwriting during
  restore.

This can be CLI-local and does not need MiniAgent core changes.

## Tools

The CLI should register CLI-flavored wrappers instead of exposing low-level
file/shell tools directly.

Required first-tranche tools:

- `read`: workspace-aware file/directory read with line range support.
- `write`: write or create files, with snapshot, permission, and parent dir
  creation.
- `edit`: exact replacement with uniqueness checks and snapshot.
- `multi_edit`: multiple exact replacements in one file, all-or-nothing.
- `patch`: apply unified patches through a structured parser when feasible.
- `glob`: fast file pattern search, ignoring noisy directories.
- `grep`: fast content search, preferring `rg` when available.
- `shell`: cross-platform shell execution with timeout, streaming status, and
  abort.
- `todo`: existing task tools or CLI-scoped wrappers around them.
- `agent_context`: existing context loader.
- `load_skill`: existing skill loader when configured.
- `run_subagent`: existing subagent tool when configured.

Later tools:

- `git_status`, `git_diff`, `git_commit` wrappers;
- `web_fetch` if network search becomes a CLI feature;
- `lsp_diagnostics` if language-server support is added.

### Shell Strategy

The shell runtime must be cross-platform:

- Windows default: PowerShell.
- Optional Windows modes: Git Bash path, WSL, or cmd.
- macOS/Linux default: user's shell or `/bin/sh`.
- Config can override shell executable and args.

The current `bash` tool's hard-coded `bash -c` is not acceptable as the CLI's
default shell behavior on Windows.

### Workspace Safety

CLI-local mutating tools must understand the workspace root:

- default reads/searches stay inside the workspace unless an absolute path is
  explicitly allowed by config;
- writes/edits outside the workspace default to `ask` or `deny`;
- generated snapshots store absolute target paths and workspace-relative
  display paths;
- symlink behavior must be explicit before broad write access is allowed.

## Agent Construction

The CLI remains a consumer of semantic blueprint assembly.

The CLI agent factory should:

- load CLI config;
- resolve providers and model selection;
- create a `BlueprintManager`;
- register built-in implementations;
- register CLI-specific approval and CLI-specific tool implementations;
- create a default CLI blueprint for the active mode;
- assemble the MiniAgent for the active session.

Build and Plan mode differ mainly by:

- system prompt;
- permission defaults;
- available mutating tools;
- visible mode indicator;
- optional max-turn guard.

The core `MiniAgent` object should remain low-level and unaware of TUI state.

## TUI Design

The TUI should be a full-screen Ink app using the existing alternate-screen
behavior.

Primary areas:

- transcript viewport;
- status line;
- command palette or autocomplete popup;
- input box;
- modal/panel overlay.

Message rendering requirements:

- user messages are compact but visible;
- assistant output streams live;
- reasoning is hidden by default or controlled by `/thinking`;
- tool call rows show name, status, duration, and short argument summary;
- tool details can expand into full args/result;
- failed tool calls are visually distinct from denied tool calls;
- approval prompts take focus and make the action clear;
- panels can be closed with Escape.

Keyboard requirements:

- Enter submits;
- Ctrl+C stops current run if running, exits if idle after confirmation or
  second press;
- arrow keys navigate autocomplete or scroll depending on focus;
- PageUp/PageDown scroll transcript;
- Tab switches primary agent mode when focus is normal;
- Escape closes panel/modal.

Mouse support is optional.

## Configuration

The existing `.cliagent/config.json` remains supported and grows product-level
fields.

Target shape:

```json
{
  "providers": [],
  "defaultModel": "",
  "generation": {
    "temperature": 0.7,
    "thinking": "medium"
  },
  "systemPrompt": "You are a helpful coding agent.",
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
  "mcp": {
    "servers": {}
  },
  "skill": {
    "directories": [".cliagent/skill"]
  },
  "subagent": {
    "path": ".cliagent/subagent"
  }
}
```

Config parsing must remain strict through Zod. Optional fields must not write
explicit `undefined` values because the project uses `exactOptionalPropertyTypes`.

## Error Handling

Errors should be classified for the UI:

- configuration errors;
- model/provider errors;
- permission denials;
- tool execution errors;
- shell timeout/abort;
- agent stopped;
- session IO errors;
- unknown command/input errors.

The runtime should convert recoverable errors into visible TUI events without
crashing the process. Fatal startup errors can still print to stderr and exit.

Tool exceptions should normally become tool results, preserving the transcript.
Agent-level failures should emit `run:error` and show a compact error panel.

## Core Change Candidates

These changes are useful but require explicit approval before implementation:

1. Add a TypeScript equivalent of Python `MessageStopException`.
   - Desired behavior: a tool can provide final result text, MiniAgent records
     the paired `ToolResult`, then ends the run as a normal completion.
   - Benefit: terminal tools such as `finish`, `guide`, or future workflow tools
     can cleanly close a run without leaving an unmatched tool call.

2. Add parse-error-aware tool calls.
   - Desired behavior: malformed tool-call arguments produce a tool result that
     asks the model to retry with valid JSON, instead of surfacing as a raw
     agent error.
   - Benefit: better recovery from streaming JSON/tool-call issues.

3. Add empty assistant reply nudge.
   - Desired behavior: repeated empty assistant messages trigger a bounded
     retry/nudge before final completion.
   - Benefit: avoids accidental task termination from empty model responses.

4. Improve core compressor/message-source split safety.
   - Desired behavior: compression never splits a `ToolCall`/`ToolResult` pair.
   - Benefit: prevents invalid context history after compaction.

The first implementation tranche should avoid core changes unless one becomes
unavoidable. If unavoidable, stop and ask for approval with a focused rationale.

## Implementation Phases

### Phase 1: Product Runtime And TUI Kernel

Deliver a usable single-process TUI with:

- runtime facade;
- command registry;
- permission service;
- interactive approval;
- richer session service;
- input routing for normal messages, slash commands, `@file`, and `!shell`;
- CLI-local tools for read/write/edit/multi_edit/glob/grep/shell/todo;
- build/plan primary modes;
- TUI panels for help, models, sessions, tools, context, history, and approvals;
- focused tests for runtime services and components.

### Phase 2: Undo/Redo, Custom Commands, Export/Import

Add:

- file snapshot journal;
- `/undo` and `/redo`;
- custom command files;
- Markdown and JSON export;
- JSON import;
- better session titles and metadata.

### Phase 3: Advanced Developer Experience

Add:

- git-aware tools;
- optional external editor composition;
- richer diff viewer;
- optional LSP diagnostics;
- improved subagent presentation;
- optional global config directory.

### Phase 4: Optional Core Enhancements

Only after explicit approval:

- `MessageStopException` equivalent;
- parse-error tool-result recovery;
- empty-response nudge;
- pair-safe core compression improvements.

## Testing Strategy

Each phase should be test-driven where practical.

Required test categories:

- config schema and defaults;
- command registry registration, aliasing, completion, and execution;
- input routing for slash commands, `@file`, `!shell`, and normal messages;
- permission policy resolution and approval prompt flow;
- session service operations;
- agent factory selection of build/plan modes;
- CLI-local tool safety and snapshots;
- TUI component rendering;
- runtime event normalization;
- integration tests with fake MiniAgent/LLM where possible.

Before any commit, repo rules require:

```bash
npm run lint
npm run build
npm test
```

## Architecture Impact

There is no `docs/architecture/` tree in the current MiniAgent repository, so
no existing architecture-intent document covers the CLI footprint.

Touchpoint A classification:

- footprint: `src/cli/**`, plus CLI wrappers around tool assembly;
- existing intent docs: none found;
- declaration: none, because there is no existing marked boundary to cross;
- follow-up: after code lands and tests pass, Touchpoint B should bootstrap
  architecture documentation for the CLI runtime/TUI boundary and reconcile any
  affected provider/blueprint documents if they exist by then.

No architecture document is created or edited before implementation because
architecture documents must trail landed code.

## Acceptance Criteria

- Running the package CLI with no subcommand opens a full-screen single-process
  TUI for the current project.
- The TUI is not backed by a separate long-running HTTP server.
- The CLI uses MiniAgent and semantic blueprint assembly rather than a separate
  agent core.
- Slash commands are implemented through a command registry, not a monolithic
  switch in the entry file.
- The CLI has build and plan primary modes.
- The CLI supports normal prompts, slash commands, `@file` references, and
  `!shell` shortcuts.
- Tool approval is real: read/search can auto-allow, mutating tools can ask,
  explicit denies are enforced, and auto mode does not override denies.
- The CLI exposes workspace-aware read/write/edit/multi_edit/patch/search/shell
  tools with snapshots for mutating operations.
- Shell execution works on Windows without assuming `bash`.
- Session management supports list/create/switch/fork/rename/delete and
  persists session metadata.
- Context/history/tool/model/session/help panels are available in the TUI.
- Reasoning visibility and tool details are user-toggleable.
- Context compression remains available.
- Export/import, undo/redo, and custom command files are implemented by the end
  of Phase 2.
- MiniAgent core is not changed unless the user explicitly approves the
  specific change.
- Any approved core change is covered by focused tests.
- `npm run lint`, `npm run build`, and `npm test` pass before committing code.

