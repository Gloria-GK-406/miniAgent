# CLI Runtime 路 single-process agent CLI product layer

> **1. Viewpoint level**: This document looks at `src/cli/**` as the product layer above MiniAgent core. The process entry invokes the CLI runtime, the runtime assembles MiniAgent instances and CLI services, and Ink components render only runtime state.
>
> **Unit code**: `cli`
>
> **2. Signal strength**: Each design tradeoff in the text is marked by strength: 🧱 **structural convention** (harder, change with care) / 💡 **recommended** (has a tradeoff basis, discussable) / 🧪 **tentative** (fastest-to-ship option, not deeply considered, likely to change).
>
> **3. Scope**: This is a specification-style map for the CLI product layer: entry dispatch, runtime state, command routing, agent assembly, CLI-local tools, persistence services, and Ink rendering. It does not describe MiniAgent core internals. ⚠️ To really see how it runs, reading the code beats reading this document; behavioral details defer to `src/cli`.

---

## 1. Structure overview

This unit splits the single-process CLI into seven top-level subparts with non-overlapping responsibilities. `runtime/app.ts` is the shared state and event hub that the entry, commands, tools, and TUI all pass through.

```
┌────────────────────────────────────────────────────────────┐
│ process entry + headless runners                           │
│ parse argv, choose TUI or one-shot command                 │
└───────────────┬────────────────────────────────────────────┘
                │ selected action / cwd
                v
┌────────────────────────────────────────────────────────────┐
│ runtime facade + state hub                                 │
│ owns config, sessions, active MiniAgent, panels, approvals │
└───┬───────────────┬────────────────┬───────────────────────┘
    │               │                │
    │ build agent   │ route input    │ render state/events
    v               v                v
┌─────────────┐ ┌──────────────┐ ┌───────────────────────────┐
│ agent       │ │ commands +   │ │ Ink TUI components         │
│ assembly    │ │ input router │ │ transcript, panels, input  │
└──────┬──────┘ └──────┬───────┘ └───────────────────────────┘
       │ extra uses    │ tool/input actions
       v               v
┌────────────────────────────────────────────────────────────┐
│ CLI-local tools + permission/safety layer                  │
│ workspace IO, shell, git, snapshots, approval policy       │
└───────────────┬────────────────────────────────────────────┘
                │ persists / loads
                v
┌────────────────────────────────────────────────────────────┐
│ persistence and workflow services                          │
│ sessions, exports, config, editor, diagnostics, references │
└────────────────────────────────────────────────────────────┘
```

| Subpart | File | One-line responsibility | Boundary (what it does not touch) |
|---|---|---|---|
| Process entry and headless runners | `src/cli/index.tsx` | Parses entry actions and either runs a one-shot command or mounts the TUI. | ⏳[INV-cli-entry-no-agent-logic] Does not own MiniAgent lifecycle logic <br> ⏳[INV-cli-entry-runtime-dispatch] Creates a runtime before headless actions that need agent/session state |
| Runtime facade and state hub | `src/cli/runtime/app.ts` | Owns config, services, active session, active MiniAgent, state mutation, events, and approval resolution. | ⏳[INV-cli-runtime-tui-agnostic] Does not render Ink UI <br> ⏳[INV-cli-runtime-core-boundary] Does not modify MiniAgent core behavior |
| Agent assembly bridge | `src/cli/runtime/agent-factory.ts` | Builds MiniAgent instances from CLI config, blueprint assembly, CLI-local tools, and subagent factories. | ⏳[INV-cli-factory-single-process] Does not introduce a separate server/runtime process <br> ⏳[INV-cli-factory-cli-tools-over-core-tools] Routes product tool behavior through CLI extra uses |
| Commands and input routing | `src/cli/commands/builtin.ts`; `src/cli/runtime/input-router.ts` | Turns user input into slash-command execution, shell shortcuts, or prompt messages with references. | ⏳[INV-cli-command-runtime-api] Commands call runtime methods rather than touching services directly <br> ⏳[INV-cli-router-no-agent-run] Router classifies input but does not call `MiniAgent.run()` |
| CLI-local tools and safety | `src/cli/tools/cli-toolkit.ts`; `src/cli/tools/git-toolkit.ts` | Provides workspace-aware read/search/mutation/shell/git tools with permission and snapshot hooks. | ⏳[INV-cli-tools-workspace-root] File tools resolve paths through the workspace boundary <br> ⏳[INV-cli-tools-permission-first] Mutating and shell/git commit tools check permission before side effects |
| Persistence and workflow services | `src/cli/runtime/session-service.ts`; `src/cli/runtime/snapshot-service.ts` | Stores project-local sessions, metadata, exports, snapshots, references, diagnostics, and config. | ⏳[INV-cli-services-project-local] Session/export/snapshot state lives under project-local `.cliagent/` unless explicitly global config is being read <br> ⏳[INV-cli-services-core-storage-wrapper] Session rewrites are CLI service operations, not core `MessageSource` API changes |
| Ink TUI view layer | `src/cli/components/App.tsx` | Subscribes to runtime state and renders transcript, panels, approval prompts, autocomplete, input, and status. | ⏳[INV-cli-tui-runtime-only] Does not call `MiniAgent.run()` directly <br> ⏳[INV-cli-tui-panel-state] Panel routing is driven by `CLIViewPanel` state |

> **Rationale** ⏳ pending

---

## 2. Assembly entry / seam

`src/cli/index.tsx` is the process composition seam. It parses argv into a `CLIEntryAction`, creates `createCLIRuntime()` for actions that need runtime state, and mounts `<App runtime={runtime} />` only for the interactive TUI path.

```
node bin
  └─ src/cli/index.tsx
       ├─ parseCLIEntryArgs()
       ├─ headless runners
       └─ createCLIRuntime(cwd)
            ├─ CLI services
            ├─ createCLIAgentFactory()
            └─ Ink <App runtime={runtime}>
```

↪ code: `src/cli/index.tsx:42`

> **Rationale** ⏳ pending

---

## 3. Process entry and headless dispatch

**What**: Entry handling is a thin process layer that maps CLI flags to typed actions, delegates behavior to runners or runtime methods, and keeps interactive rendering as one terminal-mounted path.

| Name / entry | What it does | Key convention / boundary |
|---|---|---|
| `parseCLIEntryArgs()` | Converts argv into discriminated headless/TUI actions. | ⏳[INV-cli-entry-typed-actions] Action selection is represented as typed data before execution |
| `main()` headless branches | Dispatches list, config, session, git, diagnostics, permission, and print actions. | ⏳[INV-cli-entry-headless-destroy] Runtime-backed headless branches destroy the runtime in `finally` paths |
| `render(<App runtime={runtime} />)` | Starts the interactive Ink app with a single runtime instance. | ⏳[INV-cli-entry-single-tui-runtime] The TUI path uses one in-process runtime object |

↪ code: `src/cli/entry-args.ts:155`
↪ code: `src/cli/index.tsx:411`

> **Rationale** ⏳ pending

---

## 4. Runtime facade and state hub

**What**: `createCLIRuntime()` constructs all CLI services, owns mutable `CLIState`, emits normalized events, and exposes a narrow `CLIAppRuntime` method surface to commands and the TUI.

| Name / entry | What it does | Key convention / boundary |
|---|---|---|
| `CLIState` / `CLIViewPanel` | Defines the serializable state shape consumed by React views and headless formatters. | ⏳[INV-cli-state-view-model] View panels are data variants, not component instances |
| `requestApproval()` / `answerApproval()` | Converts permission asks into focused approval state and resolves pending Promises. | ⏳[INV-cli-approval-runtime-owned] Approval resolution is owned by runtime state, not by individual tools |
| `bindAgentEvents()` | Normalizes MiniAgent events into `CLIState` and tool/activity events. | ⏳[INV-cli-runtime-event-normalization] MiniAgent events are translated before TUI consumption |
| `submitInput()` | Routes user input, calls MiniAgent for prompts, and records shell shortcuts as tool-style transcript messages. | ⏳[INV-cli-runtime-single-agent-call-site] Normal prompt execution reaches `MiniAgent.run()` only through the runtime |
| Session/runtime methods | Create/switch/fork/delete sessions, export/import, undo/redo, compact, git/diff, diagnostics, doctor, agents, permissions, and system prompt operations. | ⏳[INV-cli-runtime-service-facade] UI and commands use runtime methods rather than service instances |

↪ code: `src/cli/runtime/types.ts:16`
↪ code: `src/cli/runtime/app.ts:106`
↪ code: `src/cli/runtime/app.ts:149`
↪ code: `src/cli/runtime/app.ts:354`
↪ code: `src/cli/runtime/app.ts:453`
↪ code: `src/cli/runtime/app.ts:703`

> **Rationale** ⏳ pending

---

## 5. Agent assembly and blueprint bridge

**What**: The CLI agent factory is the boundary between product configuration and MiniAgent assembly. It builds session-scoped MiniAgent instances, injects CLI-specific tools/approval, and creates subagent MiniAgent instances through the same CLI-aware assembly path.

| Name / entry | What it does | Key convention / boundary |
|---|---|---|
| `createCLIAgentFactory()` | Loads CLI config and returns a session-aware build function. | ⏳[INV-cli-factory-config-source] Agent construction reads CLI config through the config layer |
| `createConfiguredSubagentFactory()` | Creates subagent MiniAgent instances from configured subagent entries and parent model/generation state. | ⏳[INV-cli-subagents-share-cli-assembly] Subagents receive CLI runtime extra uses instead of a separate tool stack |
| `createRuntimeExtraUses()` | Registers CLI toolkit tools, git toolkit tools, and a product permission bridge for non-self-enforcing blueprint tools. | ⏳[INV-cli-extra-uses-permission-bridge] Non-CLI blueprint tools pass through product permission decisions <br> ⏳[INV-cli-extra-uses-no-double-approval] Self-enforcing CLI tools are not approved twice |
| `createCLIBlueprint()` | Builds the default semantic blueprint with CLI config fields and removes the low-level `bash` tool. | ⏳[INV-cli-blueprint-no-bash-tool] CLI shell behavior is provided by CLI-local shell tooling |

↪ code: `src/cli/runtime/agent-factory.ts:204`
↪ code: `src/cli/runtime/agent-factory.ts:239`
↪ code: `src/cli/runtime/agent-factory.ts:344`
↪ code: `src/cli/runtime/agent-factory.ts:404`

> **Rationale** ⏳ pending

---

## 6. Commands and input routing

**What**: Slash commands are registered metadata objects, and input routing classifies raw user text before the runtime decides whether to execute a command, shell shortcut, or MiniAgent prompt.

| Name / entry | What it does | Key convention / boundary |
|---|---|---|
| `createCommandRegistry()` | Stores commands by name/alias and provides execute/complete operations. | ⏳[INV-cli-commands-registry-owned] Slash command lookup is registry-based, not an entry-file switch |
| `registerBuiltinCommands()` | Registers product commands for panels, sessions, permissions, system prompt, git/diff, editor, diagnostics, activity, undo/redo, and exit. | ⏳[INV-cli-builtin-runtime-methods] Built-ins operate through `CLICommandContext.runtime` and `updateState()` |
| `loadCustomCommands()` | Loads `.cliagent/commands/*.md`, parses frontmatter, renders arguments, and submits through runtime input APIs. | ⏳[INV-cli-custom-turn-path] Custom command bodies re-enter the same runtime input path as normal prompts |
| `createInputRouter()` | Distinguishes slash commands, `!shell`, and normal prompts with resolved references. | ⏳[INV-cli-router-classification-only] Router performs classification and reference resolution but leaves agent execution to the runtime |
| `createReferenceTurnContextAppender()` | Adds resolved `@file` reference content for the active turn and clears it after submission. | ⏳[INV-cli-reference-turn-scoped] File references are turn-local context, not persistent system prompt state |

↪ code: `src/cli/runtime/command-registry.ts:27`
↪ code: `src/cli/commands/builtin.ts:73`
↪ code: `src/cli/runtime/custom-command-service.ts:52`
↪ code: `src/cli/runtime/input-router.ts:61`
↪ code: `src/cli/runtime/reference-turn-context.ts:1`

> **Rationale** ⏳ pending

---

## 7. CLI-local tools and safety services

**What**: CLI tools wrap file IO, search, shell, and git actions with workspace path resolution, permission decisions, and snapshot hooks before exposing them to MiniAgent.

| Name / entry | What it does | Key convention / boundary |
|---|---|---|
| `assertPermission()` | Resolves allow/ask/deny before tool execution and calls runtime approval when needed. | ⏳[INV-cli-tools-permission-precedes-effect] Permission checks precede tool side effects |
| `resolveWorkspacePath()` | Converts user paths into absolute/display paths under the workspace root. | ⏳[INV-cli-workspace-path-gate] File tools do not use raw user paths for filesystem mutation |
| `mutateWithSnapshot()` | Wraps file mutations in snapshot recording and reference-list refresh hooks. | ⏳[INV-cli-mutation-snapshot-hook] Mutating tools can be undone through the snapshot service |
| `createReadTool()` / `createGlobTool()` / `createGrepTool()` | Provides read/search primitives for workspace files. | ⏳[INV-cli-read-search-no-mutation] Read/search tools do not write workspace files |
| `write` / `delete` / `move` / `edit` / `multi_edit` / `patch` | Performs workspace mutations with exact replacement or conservative patch semantics. | ⏳[INV-cli-mutations-structured] Mutations use structured tool schemas and explicit filesystem operations |
| `createShellTool()` | Executes commands through `ShellService`, reporting stdout/stderr/status text. | ⏳[INV-cli-shell-service-only] Shell tools do not spawn processes directly |
| `createGitToolkit()` / `createGitService()` | Exposes read-only git operations and guarded `git_commit` through spawn argument arrays. | ⏳[INV-cli-git-toolkit-guarded-commit] `git_commit` is the only mutating git tool and is permission-gated |

↪ code: `src/cli/tools/cli-toolkit.ts:85`
↪ code: `src/cli/tools/workspace.ts:8`
↪ code: `src/cli/tools/cli-toolkit.ts:99`
↪ code: `src/cli/tools/cli-toolkit.ts:317`
↪ code: `src/cli/tools/cli-toolkit.ts:392`
↪ code: `src/cli/tools/cli-toolkit.ts:573`
↪ code: `src/cli/tools/git-toolkit.ts:46`
↪ code: `src/cli/runtime/git-service.ts:61`

> **Rationale** ⏳ pending

---

## 8. Persistence and workflow services

**What**: Runtime services isolate project-local storage, config mutation, references, shell execution, diagnostics, editor composition, and project instructions from both TUI components and MiniAgent core.

| Name / entry | What it does | Key convention / boundary |
|---|---|---|
| `loadConfig()` / config schema | Loads project/global config, merges objects, and validates through Zod. | ⏳[INV-cli-config-zod-gate] CLI config is parsed before runtime use |
| `createCLISessionService()` | Wraps `SessionManager` with active-session, metadata, message rewrite, fork, delete, and runtime metadata operations. | ⏳[INV-cli-session-service-wrapper] Session lifecycle behavior stays in CLI services |
| `createSnapshotService()` | Records before/after file states per turn and restores/reapplies snapshots for undo/redo. | ⏳[INV-cli-snapshot-conflict-check] Restore/reapply refuses mismatched current file state |
| `createExportService()` | Exports/imports sessions as Markdown or schema-validated JSON. | ⏳[INV-cli-export-schema] JSON session import/export passes through `CLISessionExportSchema` |
| `createReferenceService()` | Lists and resolves workspace reference candidates and line ranges. | ⏳[INV-cli-reference-workspace-scope] Reference resolution is workspace-scoped |
| `createShellService()` | Selects cross-platform shell invocations and executes commands with timeout/abort status. | ⏳[INV-cli-shell-cross-platform-service] Process spawning is centralized behind `ShellService` |
| `createEditorService()` / `createDiagnosticsService()` / `createDoctorService()` | Supports external prompt composition, discovered/configured diagnostics, and health checks. | ⏳[INV-cli-workflow-services-panel-data] Workflow services return data consumed by runtime panels |

↪ code: `src/cli/config.ts:112`
↪ code: `src/cli/config.ts:198`
↪ code: `src/cli/config.ts:289`
↪ code: `src/cli/runtime/session-service.ts:93`
↪ code: `src/cli/runtime/snapshot-service.ts:91`
↪ code: `src/cli/runtime/export-service.ts:13`
↪ code: `src/cli/runtime/reference-service.ts:97`
↪ code: `src/cli/runtime/shell-service.ts:1`
↪ code: `src/cli/runtime/editor-service.ts:100`
↪ code: `src/cli/runtime/diagnostics-service.ts:40`
↪ code: `src/cli/runtime/doctor-service.ts:155`

> **Rationale** ⏳ pending

---

## 9. Ink TUI view layer

**What**: The Ink app reads `CLIState` through `useRuntime()`, derives local view concerns such as scroll position and suggestions, and calls runtime methods for all actions.

| Name / entry | What it does | Key convention / boundary |
|---|---|---|
| `useRuntime()` | Subscribes to runtime state events and exposes current `CLIState` to React. | ⏳[INV-cli-tui-state-subscription] React state mirrors runtime state events |
| `useSuggestion()` | Produces command/model/reference/session suggestions for `InputBox`. | ⏳[INV-cli-suggestions-view-local] Suggestions are view assistance and do not mutate runtime state |
| `App()` transcript path | Builds renderable transcript lines, scroll windows, status, command palette, and input box. | ⏳[INV-cli-app-runtime-submit] Input submission calls `runtime.submitInput()` |
| `App()` panel routing | Routes `CLIViewPanel` variants to panel components. | ⏳[INV-cli-app-panel-discriminant] Panel rendering is keyed by the runtime panel discriminant |
| `ApprovalPrompt` path | Takes focus when approval state is non-null and returns structured approval decisions. | ⏳[INV-cli-approval-focused-ui] Approval prompt replaces normal input while pending |
| `DiffView` / `ActivityView` / `PermissionsView` | Render product panels from runtime data. | ⏳[INV-cli-panels-render-data] Panels render passed data and close through runtime commands |

↪ code: `src/cli/hooks/useRuntime.ts:4`
↪ code: `src/cli/hooks/useSuggestion.ts:214`
↪ code: `src/cli/components/App.tsx:342`
↪ code: `src/cli/components/App.tsx:485`
↪ code: `src/cli/components/App.tsx:572`
↪ code: `src/cli/components/ApprovalPrompt.tsx:10`
↪ code: `src/cli/components/DiffView.tsx:80`
↪ code: `src/cli/components/ActivityView.tsx:47`

> **Rationale** ⏳ pending

---

## 10. End-to-end flow / sequence

One normal interactive prompt flows through the TUI, runtime, input router, MiniAgent, runtime event binding, and back to the TUI state.

```
InputBox
  └─ submit text
      └─ App.handleSubmit
          └─ runtime.submitInput()
              ├─ inputRouter.route()
              │    ├─ slash command -> registry.execute()
              │    ├─ !shell -> ShellService -> tool-style transcript
              │    └─ prompt -> references resolved
              ├─ referenceTurnContextAppender.setReferences()
              ├─ MiniAgent.run(user message)
              │    ├─ tool:execute -> activity/currentTool state
              │    ├─ approval request -> approval state
              │    ├─ tool:result -> activity/currentTool state
              │    └─ run:complete -> messages/streaming state
              └─ referenceTurnContextAppender.clear()
```

↪ code: `src/cli/components/App.tsx:428`
↪ code: `src/cli/runtime/app.ts:453`
↪ code: `src/cli/runtime/input-router.ts:61`
↪ code: `src/cli/runtime/app.ts:354`

> **Rationale** ⏳ pending

---

## Final. Collaborating components / drill-down

Beyond the overview axis, the following subunits are injected or called. This document only marks responsibility and seam:

| Component | Seam / role | One-line responsibility | Dedicated document |
|---|---|---|---|
| Runtime facade | Main state/event hub | Owns active session, MiniAgent, services, approvals, and user actions. | `to-be-written` |
| Agent factory | MiniAgent assembly seam | Converts CLI config/mode/session into MiniAgent instances and CLI extra uses. | `to-be-written` |
| CLI toolkits | Tool registration seam | Exposes workspace-safe file/search/shell/git tools. | `to-be-written` |
| Ink TUI app | View seam | Renders runtime state and forwards user actions to runtime methods. | `to-be-written` |
| Command registry and built-ins | Command seam | Registers slash command metadata and executes command handlers. | `to-be-written` |
| Persistence services | Runtime service seam | Handles session, export/import, snapshots, config, references, diagnostics, editor, and project instruction workflows. | `to-be-written` |
| MiniAgent core | Imported core API | Runs model/tool turns, events, persistence, compression, and blueprint-assembled behavior below the CLI layer. | — |
| Blueprint assembly | Imported assembly API | Provides semantic blueprint manager and built-in blueprint implementations consumed by CLI agent factory. | — |
| Ink and React | UI framework seam | Renders terminal UI components from state and hooks. | — |
