# Agent CLI Runtime Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Subagents are not assumed because this thread has not been explicitly authorized to spawn them. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the second production tranche of the single-process MiniAgent CLI: richer session operations, custom command files, export/import, mutating-tool snapshots, undo/redo, and the missing CLI-local edit tools.

**Architecture:** Keep MiniAgent core unchanged. Add CLI-only services under `src/cli/runtime/`, wire them through `createCLIRuntime()`, and expose behavior through slash commands and the existing Ink state model. Session and message rewrites operate on the CLI session files under `.cliagent/` rather than adding core `MessageSource` APIs.

**Tech Stack:** TypeScript strict ESM, Zod, Ink/React, Vitest, Node.js `fs/promises`, existing `SessionManager`, existing `FileMessageSource` storage format.

---

## File Structure

- Create `src/cli/runtime/session-service.ts`: CLI session wrapper for list/create/switch/fork/rename/delete, message file reads/writes, title updates, and safe last-session guard.
- Create `src/cli/runtime/session-service.test.ts`.
- Create `src/cli/runtime/export-service.ts`: JSON and Markdown export/import helpers for session data.
- Create `src/cli/runtime/export-service.test.ts`.
- Create `src/cli/runtime/custom-command-service.ts`: load `.cliagent/commands/*.md`, parse frontmatter, render prompt bodies with arguments.
- Create `src/cli/runtime/custom-command-service.test.ts`.
- Create `src/cli/runtime/snapshot-service.ts`: per-session file snapshot journal for mutating tools and undo/redo.
- Create `src/cli/runtime/snapshot-service.test.ts`.
- Modify `src/cli/tools/cli-toolkit.ts`: add `multi_edit`, `patch`, and snapshot hooks for `write`, `edit`, `multi_edit`, and `patch`.
- Modify `src/cli/tools/cli-toolkit.test.ts`.
- Modify `src/cli/runtime/types.ts`: add richer session panel state, runtime session methods, export/import paths, and undo/redo notices.
- Modify `src/cli/runtime/app.ts`: instantiate Phase 2 services, register custom commands, track active turn id, and rebuild agents after session/message mutations.
- Modify `src/cli/runtime/app.test.ts`.
- Modify `src/cli/commands/builtin.ts`: add `/new`, `/sessions` subcommands, `/export`, `/import`, `/undo`, `/redo`, and `/compact` alias.
- Modify `src/cli/commands/builtin.test.ts`.
- Modify `src/cli/components/App.tsx`: render richer session panel and visible approval/undo/export messages through existing state.
- Modify `src/cli/components/App.test.tsx` and `src/cli/integration.test.tsx`.
- Modify `src/cli/hooks/useSuggestion.ts` and `src/cli/hooks/useSuggestion.test.ts`: include Phase 2 commands.
- Modify `document/cli/repl.md`, `document/cli/repl_CN.md`, `README.md`, and `README_CN.md`: document Phase 2 commands and custom command files.

---

## Task 1: Add CLI Session Service

**Files:**
- Create: `src/cli/runtime/session-service.ts`
- Create: `src/cli/runtime/session-service.test.ts`

- [ ] **Step 1: Write failing session service tests**

Create `src/cli/runtime/session-service.test.ts` with tests for:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCLISessionService } from "./session-service.js";

describe("CLISessionService", () => {
  it("creates, switches, renames, forks, and deletes sessions with a last-session guard", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-session-service-"));
    const service = await createCLISessionService(baseDir);

    const first = await service.ensureActiveSession();
    const second = await service.createSession("feature");
    await service.switchSession(second.id);
    await service.renameSession(second.id, "renamed");
    const fork = await service.forkSession(second.id, "forked");

    expect(service.getActiveSession().id).toBe(second.id);
    expect(service.listSessions().map((s) => s.name)).toEqual(["forked", "renamed", "default"]);
    expect(fork.name).toBe("forked");

    await service.deleteSession(first.id);
    await service.deleteSession(fork.id);
    await expect(service.deleteSession(second.id)).rejects.toThrow("Cannot delete the last session");
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
npx vitest run src/cli/runtime/session-service.test.ts
```

Expected: fails because `session-service.ts` does not exist.

- [ ] **Step 3: Implement `createCLISessionService()`**

Implement a CLI-only wrapper around `SessionManager`:

- constructor input is project base directory;
- internally use `join(baseDir, CLIAGENT_DIR)`;
- `ensureActiveSession()` loads or creates `default`;
- `listSessions()` returns `SessionMeta[]` sorted by `updatedAt` descending;
- `createSession(name?: string)` creates and activates the new session;
- `switchSession(id: string)` activates an existing session or throws;
- `renameSession(id: string, name: string)` trims and rejects empty names;
- `deleteSession(id: string)` rejects deleting the final remaining session;
- `forkSession(id: string, name?: string)` copies the source session data directory and creates a new active meta;
- `getSessionPersistDir(id: string)` delegates to `SessionManager`;
- `readMessages(id: string)` reads `data/messages.jsonl`, returning `[]` if missing;
- `writeMessages(id: string, messages: Message[])` rewrites `data/messages.jsonl` and updates `messageCount`.

Use `SessionMetaSchema.parse()` for returned metadata where helpful. Do not modify `src/core/session.ts`.

- [ ] **Step 4: Run session service tests**

Run:

```bash
npx vitest run src/cli/runtime/session-service.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 1**

Run the required pre-commit checks in order, then commit:

```bash
npm run lint
npm run build
npm test
git add src/cli/runtime/session-service.ts src/cli/runtime/session-service.test.ts
git commit -m "feat(cli): add session service"
```

---

## Task 2: Wire Session Commands Into Runtime

**Files:**
- Modify: `src/cli/runtime/types.ts`
- Modify: `src/cli/runtime/app.ts`
- Modify: `src/cli/runtime/app.test.ts`
- Modify: `src/cli/commands/builtin.ts`
- Modify: `src/cli/commands/builtin.test.ts`
- Modify: `src/cli/components/App.tsx`
- Modify: `src/cli/components/App.test.tsx`

- [ ] **Step 1: Write failing runtime and command tests**

Add tests proving:

- `/new feature` creates and switches to a new session;
- `/sessions rename <id> renamed` updates state;
- `/sessions switch <id>` rebuilds the agent for that session;
- deleting the last session reports an error panel instead of throwing out of `submitInput()`.

Run:

```bash
npx vitest run src/cli/runtime/app.test.ts src/cli/commands/builtin.test.ts
```

Expected: fails because runtime has no session service methods yet.

- [ ] **Step 2: Extend runtime types**

In `src/cli/runtime/types.ts`:

- add `SessionMeta` to the session panel shape:

```ts
| { type: "sessions"; sessions: SessionMeta[] }
```

- add runtime methods:

```ts
createSession(name?: string): Promise<void>;
switchSession(id: string): Promise<void>;
renameSession(id: string, name: string): Promise<void>;
deleteSession(id: string): Promise<void>;
forkSession(id: string, name?: string): Promise<void>;
```

- add `sessions: SessionMeta[]` to `CLIState`.

- [ ] **Step 3: Wire `createCLISessionService()` in `app.ts`**

Replace direct `SessionManager` ownership in `createCLIRuntime()` with `createCLISessionService(baseDir)`.

Use helper `refreshSessionState()` to patch:

```ts
sessionId,
sessionName,
sessions,
messages,
modelName,
modelPaths
```

When switching sessions, destroy the old agent, build the new session agent, bind events, and update messages from the new agent.

- [ ] **Step 4: Add built-in session commands**

Add:

- `/new [name]` alias for session creation;
- `/sessions` with no args opens the session panel;
- `/sessions new [name]`;
- `/sessions switch <id>`;
- `/sessions fork <id> [name]`;
- `/sessions rename <id> <name>`;
- `/sessions delete <id>`.

Command handlers must catch runtime errors and set `panel: { type: "error", message }`.

- [ ] **Step 5: Update session panel rendering**

Render `state.sessions` in `SessionsPanel` with the active session marked textually. Keep it dense and terminal-friendly.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npx vitest run src/cli/runtime/app.test.ts src/cli/commands/builtin.test.ts src/cli/components/App.test.tsx
```

Expected: pass.

- [ ] **Step 7: Commit Task 2**

Run the required pre-commit checks in order, then commit:

```bash
npm run lint
npm run build
npm test
git add src/cli/runtime/types.ts src/cli/runtime/app.ts src/cli/runtime/app.test.ts src/cli/commands/builtin.ts src/cli/commands/builtin.test.ts src/cli/components/App.tsx src/cli/components/App.test.tsx
git commit -m "feat(cli): add session commands"
```

---

## Task 3: Add Export And Import Service

**Files:**
- Create: `src/cli/runtime/export-service.ts`
- Create: `src/cli/runtime/export-service.test.ts`
- Modify: `src/cli/runtime/types.ts`
- Modify: `src/cli/runtime/app.ts`
- Modify: `src/cli/commands/builtin.ts`
- Modify: `src/cli/commands/builtin.test.ts`

- [ ] **Step 1: Write failing export/import tests**

Tests should create a temporary session with messages and verify:

- Markdown export includes session title, model/mode metadata, and transcript messages;
- JSON export validates through a Zod schema;
- JSON import creates a new session with the imported messages.

Run:

```bash
npx vitest run src/cli/runtime/export-service.test.ts
```

Expected: fails because the service does not exist.

- [ ] **Step 2: Implement export schemas and service**

Create:

```ts
export const CLISessionExportSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  session: SessionMetaSchema,
  messages: z.array(MessageSchema),
});
```

Expose:

```ts
createExportService({
  sessionService,
  baseDir,
}): {
  exportJson(sessionId: string, outputPath?: string): Promise<string>;
  exportMarkdown(sessionId: string, outputPath?: string): Promise<string>;
  importJson(inputPath: string, name?: string): Promise<SessionMeta>;
}
```

Default output paths should live under `.cliagent/exports/`.

- [ ] **Step 3: Add `/export` and `/import` commands**

Supported forms:

- `/export markdown [path]`
- `/export json [path]`
- `/import <path> [name]`

The command result should be visible through `notice()` and set an error panel on failure.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run src/cli/runtime/export-service.test.ts src/cli/commands/builtin.test.ts src/cli/runtime/app.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 3**

Run the required pre-commit checks in order, then commit:

```bash
npm run lint
npm run build
npm test
git add src/cli/runtime/export-service.ts src/cli/runtime/export-service.test.ts src/cli/runtime/types.ts src/cli/runtime/app.ts src/cli/commands/builtin.ts src/cli/commands/builtin.test.ts
git commit -m "feat(cli): add session export import"
```

---

## Task 4: Add Custom Command Files

**Files:**
- Create: `src/cli/runtime/custom-command-service.ts`
- Create: `src/cli/runtime/custom-command-service.test.ts`
- Modify: `src/cli/runtime/app.ts`
- Modify: `src/cli/hooks/useSuggestion.ts`
- Modify: `src/cli/hooks/useSuggestion.test.ts`

- [ ] **Step 1: Write failing custom command tests**

Create tests for `.cliagent/commands/test.md`:

```md
---
description: Run tests
agent: build
---

Run tests with these arguments: {{args}}
```

Assert that loading registers `/test`, command metadata uses the description, and executing `/test src/cli` submits `Run tests with these arguments: src/cli` through normal prompt routing.

Run:

```bash
npx vitest run src/cli/runtime/custom-command-service.test.ts
```

Expected: fails because the service does not exist.

- [ ] **Step 2: Implement custom command loading**

Use the existing `yaml` dependency for frontmatter. Expose:

```ts
loadCustomCommands(baseDir: string): Promise<CLICommand[]>
```

Rules:

- project directory is `.cliagent/commands`;
- command name is the file basename without `.md`;
- reject names that are empty or include whitespace;
- frontmatter fields: `description?: string`, `agent?: "build" | "plan"`, `model?: string`;
- body supports `{{args}}` and `$ARGUMENTS`;
- command execute switches agent/model only for the command run when feasible; if model switching fails, show an error panel;
- command body is submitted through `ctx.runtime.submitInput(rendered)`.

- [ ] **Step 3: Register custom commands in runtime**

After `registerBuiltinCommands(registry)`, load custom commands and register them. Built-ins win on name conflict; custom conflicts should emit a warning notice and skip that command.

- [ ] **Step 4: Update suggestions**

Expose command names from runtime in a later phase when suggestions become runtime-driven. For this task, add static coverage for common custom command behavior only if the current hook remains static.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run src/cli/runtime/custom-command-service.test.ts src/cli/runtime/app.test.ts src/cli/hooks/useSuggestion.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit Task 4**

Run the required pre-commit checks in order, then commit:

```bash
npm run lint
npm run build
npm test
git add src/cli/runtime/custom-command-service.ts src/cli/runtime/custom-command-service.test.ts src/cli/runtime/app.ts src/cli/hooks/useSuggestion.ts src/cli/hooks/useSuggestion.test.ts
git commit -m "feat(cli): add custom command files"
```

---

## Task 5: Add Snapshot Journal Service

**Files:**
- Create: `src/cli/runtime/snapshot-service.ts`
- Create: `src/cli/runtime/snapshot-service.test.ts`
- Modify: `src/cli/tools/cli-toolkit.ts`
- Modify: `src/cli/tools/cli-toolkit.test.ts`

- [ ] **Step 1: Write failing snapshot service tests**

Tests should verify:

- recording a pre-mutation snapshot stores path, before content or missing marker, after content, turn id, and timestamp;
- duplicate snapshots for the same file in one turn keep the first `before` content and update the final `after` content;
- restoring a turn restores existing files and removes files that did not exist before;
- restore refuses when current file content differs from the recorded `after` content.

Run:

```bash
npx vitest run src/cli/runtime/snapshot-service.test.ts
```

Expected: fails because the service does not exist.

- [ ] **Step 2: Implement snapshot schemas and service**

Store the journal at:

```text
.cliagent/sessions/<session-id>/journal/snapshots.json
```

Expose:

```ts
createSnapshotService({
  baseDir,
  sessionService,
  getActiveSessionId,
  getActiveTurnId,
}): SnapshotService
```

Methods:

- `recordBeforeMutation(path, mutate)` where `mutate` returns the after content state;
- `restoreTurn(turnId)`;
- `captureRedo(turnId)`;
- `reapplyTurn(turnId)`;
- `listTurnSnapshots(turnId)`.

All paths must be resolved through `resolveWorkspacePath()`.

- [ ] **Step 3: Wire snapshots into CLI tools**

Extend `CLIToolkitOptions` with optional `snapshotService`. Wrap `write` and `edit` mutations with snapshot recording when an active turn id exists. Existing tests without a snapshot service must keep passing.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run src/cli/runtime/snapshot-service.test.ts src/cli/tools/cli-toolkit.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 5**

Run the required pre-commit checks in order, then commit:

```bash
npm run lint
npm run build
npm test
git add src/cli/runtime/snapshot-service.ts src/cli/runtime/snapshot-service.test.ts src/cli/tools/cli-toolkit.ts src/cli/tools/cli-toolkit.test.ts
git commit -m "feat(cli): add file snapshot journal"
```

---

## Task 6: Add Multi-Edit And Patch Tools

**Files:**
- Modify: `src/cli/tools/cli-toolkit.ts`
- Modify: `src/cli/tools/cli-toolkit.test.ts`
- Modify: `document/cli/repl.md`
- Modify: `document/cli/repl_CN.md`

- [ ] **Step 1: Write failing tool tests**

Add tests that prove:

- `multi_edit` applies multiple exact replacements atomically;
- `multi_edit` leaves the file unchanged when any replacement is missing;
- `patch` applies a simple unified patch to a workspace file;
- both tools request permissions and record snapshots when configured.

Run:

```bash
npx vitest run src/cli/tools/cli-toolkit.test.ts
```

Expected: fails because the tools do not exist.

- [ ] **Step 2: Implement `multi_edit`**

Add schema:

```ts
const MultiEditParamsSchema = PathParamsSchema.extend({
  edits: z.array(z.object({
    oldString: z.string().min(1),
    newString: z.string(),
  })).min(1),
});
```

Read the original content, validate every replacement exactly once, then write once. If validation fails, do not mutate.

- [ ] **Step 3: Implement minimal unified patch support**

Support single-file patches with `---`, `+++`, and `@@` hunks. Reject multi-file patches in Phase 2 with a clear error. Keep the parser structured and tested; do not shell out to `git apply`.

- [ ] **Step 4: Update docs**

Add `multi_edit` and `patch` to CLI docs. Keep wording explicit that patch support is intentionally conservative.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run src/cli/tools/cli-toolkit.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit Task 6**

Run the required pre-commit checks in order, then commit:

```bash
npm run lint
npm run build
npm test
git add src/cli/tools/cli-toolkit.ts src/cli/tools/cli-toolkit.test.ts document/cli/repl.md document/cli/repl_CN.md
git commit -m "feat(cli): add multi edit and patch tools"
```

---

## Task 7: Add Undo And Redo Commands

**Files:**
- Modify: `src/cli/runtime/session-service.ts`
- Modify: `src/cli/runtime/session-service.test.ts`
- Modify: `src/cli/runtime/app.ts`
- Modify: `src/cli/runtime/app.test.ts`
- Modify: `src/cli/commands/builtin.ts`
- Modify: `src/cli/commands/builtin.test.ts`

- [ ] **Step 1: Write failing undo/redo tests**

Tests should build a session with:

- a user message;
- assistant/tool messages after it;
- snapshot journal records for the same user message id.

Assert `/undo` removes the last user turn tail and restores snapshots. Assert `/redo` re-adds the removed messages and reapplies recorded after-content when there was no conflict.

Run:

```bash
npx vitest run src/cli/runtime/app.test.ts src/cli/commands/builtin.test.ts src/cli/runtime/session-service.test.ts
```

Expected: fails because undo/redo is not implemented.

- [ ] **Step 2: Add message tail helpers**

In `session-service.ts`, add:

- `removeLastUserTurn(sessionId): Promise<{ turnId: string; removed: Message[] }>`;
- `appendMessages(sessionId, messages: Message[]): Promise<void>`;
- `findLastUserTurn(messages): number`.

Do not add methods to core `MessageSource`.

- [ ] **Step 3: Add runtime undo stack**

Runtime keeps an in-memory redo stack for the active session:

```ts
interface RedoEntry {
  sessionId: string;
  turnId: string;
  messages: Message[];
}
```

`/undo`:

1. remove last user turn tail;
2. restore snapshots for the turn id;
3. push redo entry;
4. rebuild the agent;
5. show a notice.

`/redo`:

1. pop redo entry for the active session;
2. append messages;
3. reapply snapshots;
4. rebuild the agent;
5. show a notice.

- [ ] **Step 4: Handle conflicts conservatively**

If snapshot restore/reapply reports a conflict, set an error panel and do not rewrite messages. This is conservative and avoids destructive overwrites without adding a second approval mode in Phase 2.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run src/cli/runtime/app.test.ts src/cli/commands/builtin.test.ts src/cli/runtime/session-service.test.ts src/cli/runtime/snapshot-service.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit Task 7**

Run the required pre-commit checks in order, then commit:

```bash
npm run lint
npm run build
npm test
git add src/cli/runtime/session-service.ts src/cli/runtime/session-service.test.ts src/cli/runtime/app.ts src/cli/runtime/app.test.ts src/cli/commands/builtin.ts src/cli/commands/builtin.test.ts
git commit -m "feat(cli): add undo redo"
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

- [ ] **Step 1: Write/update suggestion tests**

Add Phase 2 command suggestions:

```text
/new
/sessions
/export
/import
/undo
/redo
/compact
```

Run:

```bash
npx vitest run src/cli/hooks/useSuggestion.test.ts
```

Expected: fail until suggestions are updated.

- [ ] **Step 2: Update docs**

Document:

- session subcommands;
- custom command file format;
- export/import formats;
- undo/redo snapshot behavior and conservative conflict handling;
- `multi_edit` and `patch` tools.

- [ ] **Step 3: Run stale-doc scan**

Run:

```bash
rg -n "/compress|/hitl|allow-all|bash -c|custom command files are not supported" README.md README_CN.md document/cli
```

Expected: no stale CLI statements.

- [ ] **Step 4: Commit Task 8**

Run the required pre-commit checks in order, then commit:

```bash
npm run lint
npm run build
npm test
git add src/cli/hooks/useSuggestion.ts src/cli/hooks/useSuggestion.test.ts README.md README_CN.md document/cli/repl.md document/cli/repl_CN.md
git commit -m "docs(cli): document runtime phase two"
```

---

## Task 9: Phase 2 Verification

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

- Phase 3: git tools, external editor composition, richer diff viewer, LSP diagnostics, improved subagent presentation, optional global config.
- Phase 4: optional MiniAgent core changes only after explicit approval.

- [ ] **Step 5: Commit verification fixes if needed**

If verification required fixes, run required checks and commit:

```bash
git add <changed-files>
git commit -m "fix(cli): stabilize runtime phase two"
```

If no fixes were required, do not create an empty commit.

---

## Architecture Impact

Touchpoint A classification for Phase 2:

- footprint: `src/cli/**`, `README*.md`, and `document/cli/**`;
- existing architecture intent docs: none found for this repository;
- declaration: no existing marked boundary is crossed;
- follow-up: after Phase 2 code lands and verification passes, Touchpoint B should bootstrap or reconcile CLI architecture documentation from landed code before branch wrap-up.

No architecture document should be created or edited before the Phase 2 implementation lands.

## Self-Review Notes

- Spec coverage: this plan covers Phase 2 acceptance items from `docs/superpowers/specs/2026-07-02-agent-cli-rewrite-design.md`: session operations, export/import, custom commands, undo/redo, snapshots, `multi_edit`, and `patch`.
- Core boundary: no task modifies `src/core/**`. Session message truncation is implemented by CLI services that understand the current file layout.
- Safety: undo/redo restores files only when current content matches the recorded post-turn content. Conflict handling is conservative and visible.
- Testing: every task starts with failing focused tests, then runs required full checks before commit.
