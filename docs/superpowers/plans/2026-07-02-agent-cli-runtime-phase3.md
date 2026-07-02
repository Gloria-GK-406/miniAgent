# Agent CLI Runtime Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Subagents are not assumed because this thread has not been explicitly authorized to spawn them. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add advanced developer-experience features to the single-process MiniAgent CLI: git-aware tools and commands, diff panels, external editor composition, diagnostics, improved subagent activity presentation, and optional global config loading.

**Architecture:** Keep MiniAgent core unchanged. Add CLI-only services under `src/cli/runtime/`, CLI-local tools under `src/cli/tools/`, and TUI panel states under `src/cli/components/`. All shell/process work stays behind runtime services so permissions, workspace safety, and testability remain centralized.

**Tech Stack:** TypeScript strict ESM, Zod, Ink/React, Vitest, Node.js `child_process`/`fs/promises`, existing CLI runtime facade and command registry.

---

## File Structure

- Create `src/cli/runtime/git-service.ts`: safe git command wrapper for status, diff, log, branch, and optional commit helpers.
- Create `src/cli/runtime/git-service.test.ts`.
- Create `src/cli/tools/git-toolkit.ts`: CLI-local `git_status`, `git_diff`, `git_log`, and guarded `git_commit` tools.
- Create `src/cli/tools/git-toolkit.test.ts`.
- Modify `src/cli/runtime/agent-factory.ts`: add git tools to runtime `extraUses`.
- Modify `src/cli/runtime/types.ts`: add diff/git/diagnostics/editor panel states and runtime methods.
- Modify `src/cli/runtime/app.ts`: instantiate git/editor/diagnostics services and expose runtime methods.
- Modify `src/cli/commands/builtin.ts`: add `/git`, `/diff`, `/editor`, and `/diagnostics`.
- Modify `src/cli/commands/builtin.test.ts`.
- Create `src/cli/components/DiffView.tsx` and `src/cli/components/DiffView.test.tsx`.
- Modify `src/cli/components/App.tsx` and `src/cli/components/App.test.tsx`: render diff and diagnostics panels.
- Create `src/cli/runtime/editor-service.ts` and `src/cli/runtime/editor-service.test.ts`: compose prompts through `$EDITOR` or configured editor.
- Create `src/cli/runtime/diagnostics-service.ts` and `src/cli/runtime/diagnostics-service.test.ts`: run project diagnostics with TypeScript/lint/test command discovery.
- Modify `src/cli/config.ts` and `src/cli/config.test.ts`: add optional `editor`, `diagnostics`, and `globalConfig` config fields.
- Create `src/cli/components/ActivityView.tsx` and `src/cli/components/ActivityView.test.tsx`: render tool/subagent activity timeline.
- Modify `src/cli/hooks/useSuggestion.ts` and `src/cli/hooks/useSuggestion.test.ts`: add Phase 3 commands.
- Modify `README.md`, `README_CN.md`, `document/cli/repl.md`, and `document/cli/repl_CN.md`.

---

## Task 1: Add Git Service

**Files:**
- Create: `src/cli/runtime/git-service.ts`
- Create: `src/cli/runtime/git-service.test.ts`

- [ ] **Step 1: Write failing git service tests**

Create `src/cli/runtime/git-service.test.ts` with tests that:

- initialize a temporary git repository;
- verify `statusShort()` returns porcelain output for a modified file;
- verify `diff({ path })` returns a diff containing changed lines;
- verify `log({ limit: 1 })` returns the latest commit subject;
- verify `commit()` refuses an empty message.

Run:

```bash
npx vitest run src/cli/runtime/git-service.test.ts
```

Expected: fails because `git-service.ts` does not exist.

- [ ] **Step 2: Implement git service**

Create `src/cli/runtime/git-service.ts` with:

```ts
export interface GitService {
  isRepository(): Promise<boolean>;
  statusShort(): Promise<string>;
  diff(options?: { staged?: boolean; path?: string }): Promise<string>;
  log(options?: { limit?: number }): Promise<string>;
  branchName(): Promise<string>;
  commit(message: string): Promise<string>;
}
```

Implementation rules:

- use `spawn` directly, not shell interpolation;
- always run with `cwd: baseDir`;
- use argument arrays such as `["status", "--short"]`;
- path arguments must be workspace-safe via `resolveWorkspacePath()`;
- `commit()` trims and rejects empty messages;
- if `git` exits non-zero, throw an error containing stderr or stdout.

- [ ] **Step 3: Run git service tests**

Run:

```bash
npx vitest run src/cli/runtime/git-service.test.ts
```

Expected: pass.

- [ ] **Step 4: Commit Task 1**

Run required checks, then:

```bash
git add src/cli/runtime/git-service.ts src/cli/runtime/git-service.test.ts
git commit -m "feat(cli): add git service"
```

---

## Task 2: Add Git Toolkit And Runtime Commands

**Files:**
- Create: `src/cli/tools/git-toolkit.ts`
- Create: `src/cli/tools/git-toolkit.test.ts`
- Modify: `src/cli/runtime/agent-factory.ts`
- Modify: `src/cli/runtime/types.ts`
- Modify: `src/cli/runtime/app.ts`
- Modify: `src/cli/commands/builtin.ts`
- Modify: `src/cli/commands/builtin.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests proving:

- `createGitToolkit()` exposes `git_status`, `git_diff`, `git_log`, and `git_commit`;
- `git_commit` asks permission before committing;
- `/git status` sets a panel containing status text;
- `/diff [path]` sets a diff panel.

Run:

```bash
npx vitest run src/cli/tools/git-toolkit.test.ts src/cli/commands/builtin.test.ts src/cli/runtime/app.test.ts
```

Expected: fails because toolkit and commands are missing.

- [ ] **Step 2: Implement git toolkit**

Use Zod parameter schemas:

- `git_status`: `{}` -> status text;
- `git_diff`: `{ staged?: boolean; path?: string }` -> diff text;
- `git_log`: `{ limit?: number }` -> log text;
- `git_commit`: `{ message: string }` -> commit output.

`git_commit` must use product permission tool name `git_commit`; read-only git tools can be allowed by config patterns.

- [ ] **Step 3: Register git tools in agent factory**

Add `gitService` and permission dependencies to `createRuntimeExtraUses()` so every CLI agent gets git tools.

- [ ] **Step 4: Add runtime methods and commands**

Runtime methods:

```ts
showGitStatus(): Promise<void>;
showDiff(path?: string): Promise<void>;
```

Panel states:

```ts
{ type: "git"; title: string; content: string }
{ type: "diff"; title: string; content: string }
```

Commands:

- `/git status`
- `/git log [limit]`
- `/diff [path]`

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run src/cli/tools/git-toolkit.test.ts src/cli/commands/builtin.test.ts src/cli/runtime/app.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit Task 2**

Run required checks, then commit:

```bash
git add src/cli/tools/git-toolkit.ts src/cli/tools/git-toolkit.test.ts src/cli/runtime/agent-factory.ts src/cli/runtime/types.ts src/cli/runtime/app.ts src/cli/commands/builtin.ts src/cli/commands/builtin.test.ts
git commit -m "feat(cli): add git tools and commands"
```

---

## Task 3: Add Diff Panel

**Files:**
- Create: `src/cli/components/DiffView.tsx`
- Create: `src/cli/components/DiffView.test.tsx`
- Modify: `src/cli/components/App.tsx`
- Modify: `src/cli/components/App.test.tsx`

- [ ] **Step 1: Write failing diff view tests**

Tests should assert added lines render green, removed lines red, hunk headers cyan, and long diffs scroll to a stable window.

Run:

```bash
npx vitest run src/cli/components/DiffView.test.tsx src/cli/components/App.test.tsx
```

Expected: fails because `DiffView.tsx` does not exist or App does not route diff panels.

- [ ] **Step 2: Implement `DiffView`**

Keep it text-first and terminal-friendly:

- title line;
- fixed-height scrollable diff body;
- color by line prefix;
- Escape closes panel;
- PageUp/PageDown and arrows scroll.

- [ ] **Step 3: Wire App panel routing**

If `state.panel.type === "diff"`, render `DiffView` with `state.panel.content`.
If `state.panel.type === "git"`, render the same view with neutral content.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run src/cli/components/DiffView.test.tsx src/cli/components/App.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit Task 3**

Run required checks, then commit:

```bash
git add src/cli/components/DiffView.tsx src/cli/components/DiffView.test.tsx src/cli/components/App.tsx src/cli/components/App.test.tsx
git commit -m "feat(cli): add diff panel"
```

---

## Task 4: Add External Editor Composition

**Files:**
- Modify: `src/cli/config.ts`
- Modify: `src/cli/config.test.ts`
- Create: `src/cli/runtime/editor-service.ts`
- Create: `src/cli/runtime/editor-service.test.ts`
- Modify: `src/cli/runtime/types.ts`
- Modify: `src/cli/runtime/app.ts`
- Modify: `src/cli/commands/builtin.ts`
- Modify: `src/cli/commands/builtin.test.ts`

- [ ] **Step 1: Write failing config and editor tests**

Tests should verify:

- config accepts `{ editor: { executable, args } }`;
- default editor resolution uses `$EDITOR` or falls back to a platform default;
- editor service writes an initial prompt to a temp file and returns edited content;
- `/editor` submits edited content through `runtime.submitInput()`.

Run:

```bash
npx vitest run src/cli/config.test.ts src/cli/runtime/editor-service.test.ts src/cli/commands/builtin.test.ts
```

Expected: fails until editor config/service/command exist.

- [ ] **Step 2: Implement editor config**

Add strict schema:

```ts
editor: {
  executable?: string;
  args?: string[];
  wait?: boolean;
}
```

Default is no explicit editor; service resolves at runtime.

- [ ] **Step 3: Implement editor service**

Expose:

```ts
openEditor(initialContent: string): Promise<string>
```

Use `spawn` with inherited stdio when running interactively. Tests can inject a fake runner.

- [ ] **Step 4: Add `/editor [initial text]` command**

The command opens the editor, then submits non-empty edited content. Empty edited content should show an info notice and not call the agent.

- [ ] **Step 5: Run focused tests and commit**

Run required focused tests and full checks, then:

```bash
git add src/cli/config.ts src/cli/config.test.ts src/cli/runtime/editor-service.ts src/cli/runtime/editor-service.test.ts src/cli/runtime/types.ts src/cli/runtime/app.ts src/cli/commands/builtin.ts src/cli/commands/builtin.test.ts
git commit -m "feat(cli): add external editor composition"
```

---

## Task 5: Add Diagnostics Service

**Files:**
- Modify: `src/cli/config.ts`
- Modify: `src/cli/config.test.ts`
- Create: `src/cli/runtime/diagnostics-service.ts`
- Create: `src/cli/runtime/diagnostics-service.test.ts`
- Modify: `src/cli/runtime/types.ts`
- Modify: `src/cli/runtime/app.ts`
- Modify: `src/cli/commands/builtin.ts`
- Modify: `src/cli/commands/builtin.test.ts`
- Modify: `src/cli/components/App.tsx`
- Modify: `src/cli/components/App.test.tsx`

- [ ] **Step 1: Write failing diagnostics tests**

Tests should verify:

- service discovers `npm run typecheck`, `npm run lint`, and `npm test` when scripts exist;
- command execution captures exit code/stdout/stderr;
- `/diagnostics` opens a panel with command results.

Run:

```bash
npx vitest run src/cli/runtime/diagnostics-service.test.ts src/cli/commands/builtin.test.ts
```

Expected: fails until service and command exist.

- [ ] **Step 2: Implement diagnostics config and service**

Config:

```ts
diagnostics: {
  commands?: string[];
  timeoutMs?: number;
}
```

Default discovery reads `package.json` scripts in the workspace. Use `ShellService` for execution so platform behavior stays consistent.

- [ ] **Step 3: Add runtime and panel state**

Panel shape:

```ts
{ type: "diagnostics"; results: DiagnosticResult[] }
```

Runtime method:

```ts
runDiagnostics(): Promise<void>
```

- [ ] **Step 4: Run focused tests and commit**

Run required focused tests and full checks, then:

```bash
git add src/cli/config.ts src/cli/config.test.ts src/cli/runtime/diagnostics-service.ts src/cli/runtime/diagnostics-service.test.ts src/cli/runtime/types.ts src/cli/runtime/app.ts src/cli/commands/builtin.ts src/cli/commands/builtin.test.ts src/cli/components/App.tsx src/cli/components/App.test.tsx
git commit -m "feat(cli): add diagnostics command"
```

---

## Task 6: Improve Activity And Subagent Presentation

**Files:**
- Modify: `src/cli/runtime/types.ts`
- Modify: `src/cli/runtime/app.ts`
- Modify: `src/cli/commands/builtin.ts`
- Modify: `src/cli/commands/builtin.test.ts`
- Create: `src/cli/components/ActivityView.tsx`
- Create: `src/cli/components/ActivityView.test.tsx`
- Modify: `src/cli/components/App.tsx`
- Modify: `src/cli/components/App.test.tsx`

- [ ] **Step 1: Write failing activity tests**

Tests should verify:

- runtime records `tool:start` and `tool:result` as activity entries;
- subagent-shaped tool names such as `run_subagent` or `subagent` render with a clear nested/agent label;
- `/activity` opens the activity panel.

Run:

```bash
npx vitest run src/cli/components/ActivityView.test.tsx src/cli/runtime/app.test.ts src/cli/commands/builtin.test.ts
```

Expected: fails until activity state and panel exist.

- [ ] **Step 2: Add activity state**

Add:

```ts
interface CLIActivityEntry {
  id: string;
  kind: "tool" | "subagent";
  name: string;
  status: "running" | "done" | "error";
  startedAt: string;
  endedAt?: string;
  summary: string;
}
```

`CLIState` gains `activity: CLIActivityEntry[]`, and `CLIViewPanel` gains
`{ type: "activity"; entries: CLIActivityEntry[] }`.

- [ ] **Step 3: Record activity in runtime**

On `tool:execute`, append a running entry. On `tool:result`, mark it done and
summarize the result. Classify subagent tools by tool name containing
`subagent`.

- [ ] **Step 4: Add `ActivityView` and `/activity` command**

Render a compact timeline with status, kind, name, and summary. App routes the
panel, and `/activity` opens it.

- [ ] **Step 5: Run focused tests and commit**

Run required focused tests and full checks, then:

```bash
git add src/cli/runtime/types.ts src/cli/runtime/app.ts src/cli/commands/builtin.ts src/cli/commands/builtin.test.ts src/cli/components/ActivityView.tsx src/cli/components/ActivityView.test.tsx src/cli/components/App.tsx src/cli/components/App.test.tsx
git commit -m "feat(cli): add activity panel"
```

---

## Task 7: Add Global Config Loading

**Files:**
- Modify: `src/cli/config.ts`
- Modify: `src/cli/config.test.ts`
- Modify: `document/cli/repl.md`
- Modify: `document/cli/repl_CN.md`

- [ ] **Step 1: Write failing config tests**

Tests should verify project config overrides global config, arrays such as providers are replaced, and object fields such as permission are shallow-merged.

Run:

```bash
npx vitest run src/cli/config.test.ts
```

Expected: fails until global config loading exists.

- [ ] **Step 2: Implement global config lookup**

Lookup order:

1. project `.cliagent/config.json`;
2. optional global config from `%APPDATA%/miniagent/config.json` on Windows or `$XDG_CONFIG_HOME/miniagent/config.json` / `~/.config/miniagent/config.json` elsewhere.

Project config wins. If neither exists, keep first-run template behavior exactly as today.

- [ ] **Step 3: Document global config**

Document project-vs-global precedence and the supported paths.

- [ ] **Step 4: Run checks and commit**

Run required checks, then:

```bash
git add src/cli/config.ts src/cli/config.test.ts document/cli/repl.md document/cli/repl_CN.md
git commit -m "feat(cli): add global config loading"
```

---

## Task 8: Update Suggestions And Documentation

**Files:**
- Modify: `src/cli/hooks/useSuggestion.ts`
- Modify: `src/cli/hooks/useSuggestion.test.ts`
- Modify: `README.md`
- Modify: `README_CN.md`
- Modify: `document/cli/repl.md`
- Modify: `document/cli/repl_CN.md`

- [ ] **Step 1: Write suggestion tests**

Add suggestions for:

```text
/git
/diff
/editor
/diagnostics
/activity
```

Run:

```bash
npx vitest run src/cli/hooks/useSuggestion.test.ts
```

Expected: fail until suggestions are updated.

- [ ] **Step 2: Update docs**

Document git tools/commands, diff panel, editor composition, diagnostics, and global config paths.

- [ ] **Step 3: Run stale scan**

Run:

```bash
rg -n "bash -c|allow-all|/hitl|custom command files are not supported|git tools are not supported" README.md README_CN.md document/cli
```

Expected: no stale CLI statements.

- [ ] **Step 4: Commit Task 7**

Run required checks, then:

```bash
git add src/cli/hooks/useSuggestion.ts src/cli/hooks/useSuggestion.test.ts README.md README_CN.md document/cli/repl.md document/cli/repl_CN.md
git commit -m "docs(cli): document runtime phase three"
```

---

## Task 9: Phase 3 Verification

**Files:**
- No direct edits unless verification exposes a defect.

- [ ] **Step 1: Run focused CLI tests**

Run:

```bash
npx vitest run src/cli
```

Expected: all CLI tests pass.

- [ ] **Step 2: Run full repository checks**

Run:

```bash
npm run lint
npm run build
npm test
```

Expected: all pass.

- [ ] **Step 3: Run CLI startup smoke**

Run:

```bash
npm run chat
```

Expected: if `.cliagent/config.json` is absent, the CLI creates the template and exits. If config is present, it starts without throwing before first render. Do not leave generated smoke-test config in the working tree.

- [ ] **Step 4: Record remaining gaps**

Final response should list remaining work toward the full objective:

- richer TUI polish for tool timelines and subagent nested display;
- optional real LSP integration beyond command-based diagnostics;
- Phase 4 core improvements only after explicit approval.

---

## Architecture Impact

Touchpoint A classification for Phase 3:

- footprint: `src/cli/**`, `README*.md`, and `document/cli/**`;
- existing architecture intent docs: none found for this repository;
- declaration: no existing marked boundary is crossed;
- follow-up: after Phase 3 code lands and verification passes, Touchpoint B should bootstrap or reconcile CLI architecture documentation from landed code before branch wrap-up.

No architecture document should be created or edited before the Phase 3 implementation lands.

## Self-Review Notes

- Spec coverage: this plan covers Phase 3 items from the CLI rewrite design: git-aware tools, external editor composition, diff viewer, diagnostics, improved subagent/activity presentation, and global config.
- Core boundary: no task modifies `src/core/**`. All behavior is CLI product layer code.
- Safety: mutating git commit action goes through product permission; git status/diff/log are read-only.
- Testing: every code task starts with failing focused tests, then runs required full checks before commit.
