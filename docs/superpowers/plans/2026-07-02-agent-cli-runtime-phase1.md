# Agent CLI Runtime Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production tranche of the single-process MiniAgent CLI: runtime facade, command registry, permissions, shell/reference routing, CLI-local tools, build/plan modes, and a TUI wired through runtime state.

**Architecture:** Keep MiniAgent core unchanged. Add a CLI product runtime under `src/cli/runtime/`, CLI-local tool wrappers under `src/cli/tools/`, command registration under `src/cli/commands/`, and adapt the existing Ink app to consume runtime actions instead of calling `MiniAgent.run()` directly. This phase deliberately excludes undo/redo, export/import, and custom command files; those are Phase 2 and the current phase must leave clean extension points for them.

**Tech Stack:** TypeScript strict ESM, Zod, Ink/React, Vitest, Node.js `fs/promises`, `child_process`, existing MiniAgent blueprint assembly.

---

## File Structure

- Modify `src/cli/config.ts`: add agent mode, permission, shell, and TUI config schemas.
- Modify `src/cli/config.test.ts`: cover new config defaults and strict parsing.
- Create `src/cli/runtime/types.ts`: shared runtime state, events, modes, command context, and small interfaces.
- Create `src/cli/runtime/permission-service.ts`: resolve `allow | ask | deny` decisions and queue approval requests.
- Create `src/cli/runtime/permission-service.test.ts`.
- Create `src/cli/runtime/shell-service.ts`: cross-platform shell selection and command execution.
- Create `src/cli/runtime/shell-service.test.ts`.
- Create `src/cli/runtime/command-registry.ts`: register, resolve, execute, and complete slash commands.
- Create `src/cli/runtime/command-registry.test.ts`.
- Create `src/cli/runtime/reference-service.ts`: resolve `@file`, `@file:start`, and `@file:start-end` references.
- Create `src/cli/runtime/reference-service.test.ts`.
- Create `src/cli/runtime/input-router.ts`: route slash commands, `!shell`, and normal prompts with references.
- Create `src/cli/runtime/input-router.test.ts`.
- Create `src/cli/runtime/session-service.ts`: wrapper around `SessionManager` with richer operations used by TUI.
- Create `src/cli/runtime/session-service.test.ts`.
- Create `src/cli/tools/workspace.ts`: path safety helpers.
- Create `src/cli/tools/workspace.test.ts`.
- Create `src/cli/tools/cli-toolkit.ts`: build CLI-local tools and the CLI approver module.
- Create `src/cli/tools/cli-toolkit.test.ts`.
- Create `src/cli/commands/builtin.ts`: register Phase 1 built-in commands.
- Create `src/cli/commands/builtin.test.ts`.
- Create `src/cli/runtime/agent-factory.ts`: build MiniAgent instances for build/plan modes.
- Create `src/cli/runtime/agent-factory.test.ts`.
- Create `src/cli/runtime/app.ts`: main runtime facade.
- Create `src/cli/runtime/app.test.ts`.
- Modify `src/cli/hooks/useAgent.ts`: keep as a compatibility hook for MiniAgent events where still useful.
- Create `src/cli/hooks/useRuntime.ts`: subscribe to `CLIAppRuntime`.
- Create `src/cli/hooks/useRuntime.test.ts`.
- Modify `src/cli/components/App.tsx`: accept runtime props and route input through runtime.
- Modify `src/cli/components/App.test.tsx`.
- Modify `src/cli/index.tsx`: use `createCLIRuntime()` and remove command switch business logic.
- Modify `src/cli/integration.test.tsx`: update smoke coverage for runtime-backed TUI.
- Modify `src/cli/cli-app.ts`: either shrink to compatibility exports that delegate to `runtime/agent-factory.ts`, or retire callers inside this phase after tests migrate.
- Modify `src/cli/cli-app.test.ts`: keep only model helper compatibility tests or move them to runtime tests.
- Modify `document/cli/repl.md` and `document/cli/repl_CN.md`: document Phase 1 behavior.

---

## Task 1: Extend CLI Config For Product Runtime

**Files:**
- Modify: `src/cli/config.ts`
- Modify: `src/cli/config.test.ts`

- [ ] **Step 1: Add failing config tests**

Append these tests to `src/cli/config.test.ts` inside the existing `describe("CLI config provider mode", () => { ... })` block:

```ts
  it("parses product runtime config defaults", () => {
    const config = CLIConfigSchema.parse({});

    expect(config).toMatchObject({
      providers: [],
      defaultModel: "",
      defaultAgent: "build",
      permission: {
        "*": "ask",
        read: "allow",
        glob: "allow",
        grep: "allow",
      },
      shell: {
        windows: "powershell",
        timeoutMs: 120000,
      },
      tui: {
        showReasoning: false,
        showToolDetails: false,
      },
    });
  });

  it("parses nested shell permission patterns", () => {
    const config = CLIConfigSchema.parse({
      permission: {
        "*": "ask",
        shell: {
          "*": "ask",
          "npm *": "allow",
          "rm *": "deny",
        },
      },
    });

    expect(config.permission.shell).toEqual({
      "*": "ask",
      "npm *": "allow",
      "rm *": "deny",
    });
  });

  it("rejects invalid agent and permission values", () => {
    expect(CLIConfigSchema.safeParse({ defaultAgent: "review" }).success).toBe(false);
    expect(CLIConfigSchema.safeParse({ permission: { read: "sometimes" } }).success).toBe(false);
    expect(CLIConfigSchema.safeParse({ shell: { windows: "fish" } }).success).toBe(false);
  });
```

- [ ] **Step 2: Run config tests and verify failure**

Run:

```bash
npx vitest run src/cli/config.test.ts
```

Expected: failure because `defaultAgent`, `permission`, `shell`, and `tui` are not yet in `CLIConfigSchema`.

- [ ] **Step 3: Add config schemas**

In `src/cli/config.ts`, insert these schemas after `CLIProviderSchema`:

```ts
export const CLIAgentModeSchema = z.enum(["build", "plan"]);
export type CLIAgentMode = z.infer<typeof CLIAgentModeSchema>;

export const CLIPermissionDecisionSchema = z.enum(["allow", "ask", "deny"]);
export type CLIPermissionDecision = z.infer<typeof CLIPermissionDecisionSchema>;

export const CLIPermissionConfigSchema = z
  .record(z.union([CLIPermissionDecisionSchema, z.record(CLIPermissionDecisionSchema)]))
  .default({
    "*": "ask",
    read: "allow",
    glob: "allow",
    grep: "allow",
  });
export type CLIPermissionConfig = z.infer<typeof CLIPermissionConfigSchema>;

export const CLIShellConfigSchema = z
  .object({
    windows: z.enum(["powershell", "git-bash", "wsl", "cmd"]).default("powershell"),
    executable: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    timeoutMs: z.number().int().positive().max(600000).default(120000),
  })
  .strict()
  .default({
    windows: "powershell",
    timeoutMs: 120000,
  });
export type CLIShellConfig = z.infer<typeof CLIShellConfigSchema>;

export const CLITUIConfigSchema = z
  .object({
    showReasoning: z.boolean().default(false),
    showToolDetails: z.boolean().default(false),
  })
  .strict()
  .default({
    showReasoning: false,
    showToolDetails: false,
  });
export type CLITUIConfig = z.infer<typeof CLITUIConfigSchema>;
```

Then extend `CLIConfigSchema` with:

```ts
    defaultAgent: CLIAgentModeSchema.default("build"),
    permission: CLIPermissionConfigSchema,
    shell: CLIShellConfigSchema,
    tui: CLITUIConfigSchema,
```

Update the generated template in `loadConfig()` to include:

```ts
      defaultAgent: "build",
      permission: {
        "*": "ask",
        read: "allow",
        glob: "allow",
        grep: "allow",
      },
      shell: {
        windows: "powershell",
        timeoutMs: 120000,
      },
      tui: {
        showReasoning: false,
        showToolDetails: false,
      },
```

- [ ] **Step 4: Run config tests and verify pass**

Run:

```bash
npx vitest run src/cli/config.test.ts
```

Expected: all config tests pass.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add src/cli/config.ts src/cli/config.test.ts
git commit -m "feat(cli): add product runtime config"
```

---

## Task 2: Add Runtime Types

**Files:**
- Create: `src/cli/runtime/types.ts`
- Test coverage arrives in later runtime-service tests.

- [ ] **Step 1: Create shared runtime types**

Create `src/cli/runtime/types.ts`:

```ts
import type { MiniAgent } from "../../core/agent.js";
import type { TokenCount, Message, ToolCallMessage, ToolResultMessage } from "../../core/types.js";
import type { Tool } from "../../tool/types.js";
import type { CLIConfig, CLIAgentMode, CLIPermissionDecision } from "../config.js";

export type CLIViewPanel =
  | { type: "none" }
  | { type: "help" }
  | { type: "history"; messages: Message[] }
  | { type: "context"; messages: Message[] }
  | { type: "models" }
  | { type: "sessions" }
  | { type: "tools"; tools: Tool[] }
  | { type: "error"; message: string };

export interface CLIApprovalRequest {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  decision: "pending";
}

export interface CLIState {
  baseDir: string;
  config: CLIConfig;
  mode: CLIAgentMode;
  modelName: string;
  modelPaths: string[];
  sessionId: string;
  sessionName: string;
  autoApprove: boolean;
  showReasoning: boolean;
  showToolDetails: boolean;
  isRunning: boolean;
  currentTool: string | null;
  messages: Message[];
  streamingText: string;
  reasoningText: string;
  turnCount: number;
  tokenUsage: TokenCount;
  panel: CLIViewPanel;
  approval: CLIApprovalRequest | null;
  error: string | null;
}

export type CLIEvent =
  | { type: "state"; state: CLIState }
  | { type: "notice"; level: "info" | "warn" | "error"; message: string }
  | { type: "tool:start"; toolCall: ToolCallMessage }
  | { type: "tool:result"; toolCall: ToolCallMessage; result: ToolResultMessage };

export interface CLIRuntimeSubscriber {
  (event: CLIEvent): void;
}

export interface CLIAppRuntime {
  getState(): CLIState;
  subscribe(listener: CLIRuntimeSubscriber): () => void;
  submitInput(input: string): Promise<void>;
  runCommand(name: string, args: string): Promise<void>;
  selectModel(path: string): Promise<void>;
  answerApproval(id: string, decision: boolean): void;
  stop(): void;
  rebuildAgent(reason: string): Promise<void>;
  destroy(): Promise<void>;
}

export interface CLICommandContext {
  runtime: CLIAppRuntime;
  agent: MiniAgent;
  getState: () => CLIState;
  updateState: (patch: Partial<CLIState>) => void;
  notice: (level: "info" | "warn" | "error", message: string) => void;
}

export interface CLICommand {
  name: string;
  aliases?: string[];
  description: string;
  usage: string;
  hidden?: boolean;
  execute(ctx: CLICommandContext, args: string): Promise<void>;
  complete?(ctx: CLICommandContext, args: string): Promise<string[]>;
}

export interface CLIPermissionRequest {
  toolName: string;
  args: Record<string, unknown>;
}

export interface CLIPermissionResult {
  decision: CLIPermissionDecision;
  reason: string;
}
```

- [ ] **Step 2: Run TypeScript build**

Run:

```bash
npm run build
```

Expected: pass. The new file has no consumers yet.

- [ ] **Step 3: Commit Task 2**

Run:

```bash
git add src/cli/runtime/types.ts
git commit -m "feat(cli): add runtime state types"
```

---

## Task 3: Implement Permission Service

**Files:**
- Create: `src/cli/runtime/permission-service.ts`
- Create: `src/cli/runtime/permission-service.test.ts`

- [ ] **Step 1: Write permission service tests**

Create `src/cli/runtime/permission-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createPermissionService, matchCommandPattern } from "./permission-service.js";
import type { CLIPermissionConfig } from "../config.js";

describe("matchCommandPattern", () => {
  it("matches star patterns against shell commands", () => {
    expect(matchCommandPattern("npm *", "npm test")).toBe(true);
    expect(matchCommandPattern("git status*", "git status --short")).toBe(true);
    expect(matchCommandPattern("rm *", "npm test")).toBe(false);
  });
});

describe("PermissionService", () => {
  it("allows read tools by default", () => {
    const service = createPermissionService({
      "*": "ask",
      read: "allow",
    });

    expect(service.resolve({ toolName: "read", args: {} }, false)).toEqual({
      decision: "allow",
      reason: "tool rule read",
    });
  });

  it("enforces explicit deny even when auto approve is on", () => {
    const service = createPermissionService({
      "*": "ask",
      shell: {
        "*": "ask",
        "rm *": "deny",
      },
    });

    expect(service.resolve({
      toolName: "shell",
      args: { command: "rm -rf dist" },
    }, true)).toEqual({
      decision: "deny",
      reason: "shell pattern rm *",
    });
  });

  it("auto allows ask decisions when auto approve is enabled", () => {
    const service = createPermissionService({ "*": "ask" });

    expect(service.resolve({ toolName: "edit", args: {} }, true)).toEqual({
      decision: "allow",
      reason: "auto approve",
    });
  });

  it("keeps ask when auto approve is disabled", () => {
    const config: CLIPermissionConfig = { "*": "ask", write: "ask" };
    const service = createPermissionService(config);

    expect(service.resolve({ toolName: "write", args: {} }, false)).toEqual({
      decision: "ask",
      reason: "tool rule write",
    });
  });
});
```

- [ ] **Step 2: Run permission tests and verify failure**

Run:

```bash
npx vitest run src/cli/runtime/permission-service.test.ts
```

Expected: fail because `permission-service.ts` does not exist.

- [ ] **Step 3: Implement permission service**

Create `src/cli/runtime/permission-service.ts`:

```ts
import type { CLIPermissionConfig, CLIPermissionDecision } from "../config.js";
import type { CLIPermissionRequest, CLIPermissionResult } from "./types.js";

export interface PermissionService {
  resolve(request: CLIPermissionRequest, autoApprove: boolean): CLIPermissionResult;
}

function isDecision(value: unknown): value is CLIPermissionDecision {
  return value === "allow" || value === "ask" || value === "deny";
}

function getCommandText(args: Record<string, unknown>): string {
  const value = args["command"];
  return typeof value === "string" ? value : "";
}

export function matchCommandPattern(pattern: string, command: string): boolean {
  if (pattern === "*") {
    return true;
  }
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`).test(command);
}

function resolveNestedRule(
  toolName: string,
  args: Record<string, unknown>,
  nested: Record<string, CLIPermissionDecision>,
): CLIPermissionResult {
  const text = toolName === "shell" ? getCommandText(args) : JSON.stringify(args);
  for (const [pattern, decision] of Object.entries(nested)) {
    if (pattern !== "*" && matchCommandPattern(pattern, text)) {
      return { decision, reason: `${toolName} pattern ${pattern}` };
    }
  }
  const fallback = nested["*"];
  if (fallback !== undefined) {
    return { decision: fallback, reason: `${toolName} pattern *` };
  }
  return { decision: "ask", reason: `${toolName} nested fallback` };
}

export function createPermissionService(config: CLIPermissionConfig): PermissionService {
  return {
    resolve: (request, autoApprove): CLIPermissionResult => {
      const toolRule = config[request.toolName];
      let result: CLIPermissionResult;

      if (isDecision(toolRule)) {
        result = { decision: toolRule, reason: `tool rule ${request.toolName}` };
      } else if (toolRule !== undefined) {
        result = resolveNestedRule(
          request.toolName,
          request.args,
          toolRule as Record<string, CLIPermissionDecision>,
        );
      } else {
        const fallback = config["*"];
        result = isDecision(fallback)
          ? { decision: fallback, reason: "global rule *" }
          : { decision: "ask", reason: "implicit ask" };
      }

      if (result.decision === "ask" && autoApprove) {
        return { decision: "allow", reason: "auto approve" };
      }
      return result;
    },
  };
}
```

- [ ] **Step 4: Run permission tests**

Run:

```bash
npx vitest run src/cli/runtime/permission-service.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add src/cli/runtime/permission-service.ts src/cli/runtime/permission-service.test.ts
git commit -m "feat(cli): add permission service"
```

---

## Task 4: Implement Cross-Platform Shell Service

**Files:**
- Create: `src/cli/runtime/shell-service.ts`
- Create: `src/cli/runtime/shell-service.test.ts`

- [ ] **Step 1: Write shell service tests**

Create `src/cli/runtime/shell-service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildShellInvocation, createShellService } from "./shell-service.js";

describe("buildShellInvocation", () => {
  it("uses PowerShell on Windows by default", () => {
    expect(buildShellInvocation("echo hi", { windows: "powershell", timeoutMs: 120000 }, "win32"))
      .toEqual({
        command: "powershell.exe",
        args: ["-NoLogo", "-NoProfile", "-Command", "echo hi"],
      });
  });

  it("uses sh on non-Windows by default", () => {
    expect(buildShellInvocation("echo hi", { windows: "powershell", timeoutMs: 120000 }, "linux"))
      .toEqual({
        command: "/bin/sh",
        args: ["-c", "echo hi"],
      });
  });

  it("honors explicit executable and args", () => {
    expect(buildShellInvocation("echo hi", {
      windows: "powershell",
      executable: "pwsh",
      args: ["-Command"],
      timeoutMs: 120000,
    }, "win32")).toEqual({
      command: "pwsh",
      args: ["-Command", "echo hi"],
    });
  });
});

describe("ShellService", () => {
  it("runs a simple command", async () => {
    const service = createShellService({
      windows: "powershell",
      timeoutMs: 120000,
    });

    const result = await service.execute({
      command: process.platform === "win32" ? "Write-Output shell-ok" : "printf shell-ok",
      cwd: process.cwd(),
    });

    expect(result.stdout + result.stderr).toContain("shell-ok");
    expect(result.exitCode).toBe(0);
  });
});
```

- [ ] **Step 2: Run shell tests and verify failure**

Run:

```bash
npx vitest run src/cli/runtime/shell-service.test.ts
```

Expected: fail because `shell-service.ts` does not exist.

- [ ] **Step 3: Implement shell service**

Create `src/cli/runtime/shell-service.ts`:

```ts
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { CLIShellConfig } from "../config.js";

export interface ShellInvocation {
  command: string;
  args: string[];
}

export interface ShellExecuteRequest {
  command: string;
  cwd?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ShellExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  aborted: boolean;
}

export interface ShellService {
  execute(request: ShellExecuteRequest): Promise<ShellExecuteResult>;
}

export function buildShellInvocation(
  commandText: string,
  config: CLIShellConfig,
  platform: NodeJS.Platform = process.platform,
): ShellInvocation {
  if (config.executable !== undefined) {
    return {
      command: config.executable,
      args: [...(config.args ?? []), commandText],
    };
  }

  if (platform === "win32") {
    switch (config.windows) {
      case "powershell":
        return {
          command: "powershell.exe",
          args: ["-NoLogo", "-NoProfile", "-Command", commandText],
        };
      case "cmd":
        return { command: "cmd.exe", args: ["/d", "/s", "/c", commandText] };
      case "wsl":
        return { command: "wsl.exe", args: ["sh", "-lc", commandText] };
      case "git-bash":
        return { command: "bash.exe", args: ["-lc", commandText] };
    }
  }

  return { command: "/bin/sh", args: ["-c", commandText] };
}

export function createShellService(config: CLIShellConfig): ShellService {
  return {
    execute: (request): Promise<ShellExecuteResult> => new Promise((resolve) => {
      const invocation = buildShellInvocation(request.command, config);
      const timeoutMs = request.timeoutMs ?? config.timeoutMs;
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let aborted = false;
      let child: ChildProcess;

      try {
        child = spawn(invocation.command, invocation.args, {
          cwd: request.cwd,
          env: process.env,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (error: unknown) {
        resolve({
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: null,
          timedOut: false,
          aborted: false,
        });
        return;
      }

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);

      const abort = (): void => {
        aborted = true;
        child.kill("SIGTERM");
      };

      if (request.signal !== undefined) {
        if (request.signal.aborted) {
          abort();
        } else {
          request.signal.addEventListener("abort", abort, { once: true });
        }
      }

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", (error: Error) => {
        stderr += error.message;
      });
      child.on("close", (exitCode: number | null) => {
        clearTimeout(timer);
        request.signal?.removeEventListener("abort", abort);
        resolve({ stdout, stderr, exitCode, timedOut, aborted });
      });
    }),
  };
}
```

- [ ] **Step 4: Run shell tests**

Run:

```bash
npx vitest run src/cli/runtime/shell-service.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add src/cli/runtime/shell-service.ts src/cli/runtime/shell-service.test.ts
git commit -m "feat(cli): add cross platform shell service"
```

---

## Task 5: Implement Command Registry

**Files:**
- Create: `src/cli/runtime/command-registry.ts`
- Create: `src/cli/runtime/command-registry.test.ts`

- [ ] **Step 1: Write command registry tests**

Create `src/cli/runtime/command-registry.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createCommandRegistry } from "./command-registry.js";
import type { CLICommandContext } from "./types.js";

function ctx(): CLICommandContext {
  return {
    runtime: {} as CLICommandContext["runtime"],
    agent: {} as CLICommandContext["agent"],
    getState: vi.fn(),
    updateState: vi.fn(),
    notice: vi.fn(),
  };
}

describe("CommandRegistry", () => {
  it("registers and resolves commands by name and alias", async () => {
    const registry = createCommandRegistry();
    const execute = vi.fn(async () => undefined);

    registry.register({
      name: "quit",
      aliases: ["q"],
      description: "Exit",
      usage: "/quit",
      execute,
    });

    await registry.execute(ctx(), "/q");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("splits command args after the command token", async () => {
    const registry = createCommandRegistry();
    const execute = vi.fn(async () => undefined);
    registry.register({
      name: "system",
      description: "Set system prompt",
      usage: "/system <text>",
      execute,
    });

    await registry.execute(ctx(), "/system hello world");
    expect(execute).toHaveBeenCalledWith(expect.anything(), "hello world");
  });

  it("returns visible completions", async () => {
    const registry = createCommandRegistry();
    registry.register({
      name: "help",
      description: "Help",
      usage: "/help",
      execute: async () => undefined,
    });
    registry.register({
      name: "hidden",
      hidden: true,
      description: "Hidden",
      usage: "/hidden",
      execute: async () => undefined,
    });

    expect(await registry.complete(ctx(), "/h")).toEqual(["/help"]);
  });
});
```

- [ ] **Step 2: Run command registry tests and verify failure**

Run:

```bash
npx vitest run src/cli/runtime/command-registry.test.ts
```

Expected: fail because `command-registry.ts` does not exist.

- [ ] **Step 3: Implement command registry**

Create `src/cli/runtime/command-registry.ts`:

```ts
import type { CLICommand, CLICommandContext } from "./types.js";

export interface CommandRegistry {
  register(command: CLICommand): void;
  list(): CLICommand[];
  execute(ctx: CLICommandContext, input: string): Promise<void>;
  complete(ctx: CLICommandContext, input: string): Promise<string[]>;
}

function normalizeName(value: string): string {
  return value.startsWith("/") ? value.slice(1) : value;
}

function parseCommandInput(input: string): { name: string; args: string } {
  const trimmed = input.trim();
  const withoutSlash = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  const space = withoutSlash.indexOf(" ");
  if (space === -1) {
    return { name: withoutSlash, args: "" };
  }
  return {
    name: withoutSlash.slice(0, space),
    args: withoutSlash.slice(space + 1).trim(),
  };
}

export function createCommandRegistry(): CommandRegistry {
  const commands = new Map<string, CLICommand>();
  const aliases = new Map<string, string>();

  function requireCommand(name: string): CLICommand {
    const normalized = normalizeName(name);
    const canonical = aliases.get(normalized) ?? normalized;
    const command = commands.get(canonical);
    if (command === undefined) {
      throw new Error(`Unknown command: /${normalized}`);
    }
    return command;
  }

  return {
    register: (command): void => {
      const name = normalizeName(command.name);
      if (commands.has(name)) {
        throw new Error(`Command already registered: /${name}`);
      }
      commands.set(name, { ...command, name });
      for (const alias of command.aliases ?? []) {
        const normalizedAlias = normalizeName(alias);
        if (aliases.has(normalizedAlias) || commands.has(normalizedAlias)) {
          throw new Error(`Command alias already registered: /${normalizedAlias}`);
        }
        aliases.set(normalizedAlias, name);
      }
    },
    list: (): CLICommand[] => [...commands.values()],
    execute: async (ctx, input): Promise<void> => {
      const parsed = parseCommandInput(input);
      await requireCommand(parsed.name).execute(ctx, parsed.args);
    },
    complete: async (ctx, input): Promise<string[]> => {
      const parsed = parseCommandInput(input);
      const command = commands.get(parsed.name);
      if (command?.complete !== undefined && input.includes(" ")) {
        return command.complete(ctx, parsed.args);
      }
      const prefix = normalizeName(parsed.name);
      return [...commands.values()]
        .filter((commandItem) => commandItem.hidden !== true)
        .map((commandItem) => `/${commandItem.name}`)
        .filter((name) => name.startsWith(`/${prefix}`));
    },
  };
}
```

- [ ] **Step 4: Run command registry tests**

Run:

```bash
npx vitest run src/cli/runtime/command-registry.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 5**

Run:

```bash
git add src/cli/runtime/command-registry.ts src/cli/runtime/command-registry.test.ts
git commit -m "feat(cli): add command registry"
```

---

## Task 6: Implement Reference Service

**Files:**
- Create: `src/cli/runtime/reference-service.ts`
- Create: `src/cli/runtime/reference-service.test.ts`

- [ ] **Step 1: Write reference service tests**

Create `src/cli/runtime/reference-service.test.ts`:

```ts
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractReferenceTokens, createReferenceService } from "./reference-service.js";

describe("extractReferenceTokens", () => {
  it("extracts file references with optional ranges", () => {
    expect(extractReferenceTokens("Explain @src/a.ts and @README.md:2-4")).toEqual([
      "@src/a.ts",
      "@README.md:2-4",
    ]);
  });
});

describe("ReferenceService", () => {
  it("resolves a referenced file range", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-ref-"));
    await mkdir(join(baseDir, "src"), { recursive: true });
    await writeFile(join(baseDir, "src", "a.ts"), "one\ntwo\nthree\n", "utf-8");
    const service = createReferenceService(baseDir);

    const refs = await service.resolveReferences("Read @src/a.ts:2-3");

    expect(refs).toEqual([{
      token: "@src/a.ts:2-3",
      path: join(baseDir, "src", "a.ts"),
      displayPath: "src/a.ts",
      content: "two\nthree",
      startLine: 2,
      endLine: 3,
    }]);
  });
});
```

- [ ] **Step 2: Run reference tests and verify failure**

Run:

```bash
npx vitest run src/cli/runtime/reference-service.test.ts
```

Expected: fail because `reference-service.ts` does not exist.

- [ ] **Step 3: Implement reference service**

Create `src/cli/runtime/reference-service.ts`:

```ts
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";

export interface ResolvedReference {
  token: string;
  path: string;
  displayPath: string;
  content: string;
  startLine?: number;
  endLine?: number;
}

export interface ReferenceService {
  resolveReferences(input: string): Promise<ResolvedReference[]>;
}

const REF_PATTERN = /(^|\s)(@[^\s]+)/g;

export function extractReferenceTokens(input: string): string[] {
  const tokens: string[] = [];
  for (const match of input.matchAll(REF_PATTERN)) {
    const token = match[2];
    if (token !== undefined) {
      tokens.push(token);
    }
  }
  return tokens;
}

function parseToken(token: string): { rawPath: string; startLine?: number; endLine?: number } {
  const body = token.slice(1);
  const rangeMatch = /^(.*):(\d+)(?:-(\d+))?$/.exec(body);
  if (rangeMatch === null) {
    return { rawPath: body };
  }
  const rawPath = rangeMatch[1]!;
  const startLine = Number(rangeMatch[2]);
  const endLine = rangeMatch[3] === undefined ? startLine : Number(rangeMatch[3]);
  return { rawPath, startLine, endLine };
}

function assertInside(baseDir: string, target: string): void {
  const rel = relative(baseDir, target);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Reference escapes workspace: ${target}`);
  }
}

function sliceLines(content: string, startLine: number | undefined, endLine: number | undefined): string {
  if (startLine === undefined) {
    return content;
  }
  const lines = content.split("\n");
  return lines.slice(startLine - 1, endLine).join("\n");
}

export function createReferenceService(baseDir: string): ReferenceService {
  const root = resolve(baseDir);
  return {
    resolveReferences: async (input): Promise<ResolvedReference[]> => {
      const refs: ResolvedReference[] = [];
      for (const token of extractReferenceTokens(input)) {
        const parsed = parseToken(token);
        const target = resolve(root, normalize(parsed.rawPath));
        assertInside(root, target);
        const info = await stat(target);
        if (info.isDirectory()) {
          throw new Error(`Reference points to a directory: ${parsed.rawPath}`);
        }
        const content = await readFile(target, "utf-8");
        refs.push({
          token,
          path: target,
          displayPath: relative(root, target).replaceAll("\\", "/"),
          content: sliceLines(content, parsed.startLine, parsed.endLine),
          ...(parsed.startLine !== undefined && { startLine: parsed.startLine }),
          ...(parsed.endLine !== undefined && { endLine: parsed.endLine }),
        });
      }
      return refs;
    },
  };
}
```

- [ ] **Step 4: Run reference tests**

Run:

```bash
npx vitest run src/cli/runtime/reference-service.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 6**

Run:

```bash
git add src/cli/runtime/reference-service.ts src/cli/runtime/reference-service.test.ts
git commit -m "feat(cli): add file reference service"
```

---

## Task 7: Implement Input Router

**Files:**
- Create: `src/cli/runtime/input-router.ts`
- Create: `src/cli/runtime/input-router.test.ts`

- [ ] **Step 1: Write input router tests**

Create `src/cli/runtime/input-router.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createInputRouter } from "./input-router.js";

describe("InputRouter", () => {
  it("routes slash commands", async () => {
    const registry = { execute: vi.fn(async () => undefined) };
    const router = createInputRouter({
      commandRegistry: registry,
      shellService: { execute: vi.fn() },
      referenceService: { resolveReferences: vi.fn() },
    });

    await router.route({} as never, "/help");
    expect(registry.execute).toHaveBeenCalledWith(expect.anything(), "/help");
  });

  it("routes shell shortcuts", async () => {
    const shell = { execute: vi.fn(async () => ({ stdout: "ok", stderr: "", exitCode: 0, timedOut: false, aborted: false })) };
    const router = createInputRouter({
      commandRegistry: { execute: vi.fn() },
      shellService: shell,
      referenceService: { resolveReferences: vi.fn() },
    });

    const result = await router.route({} as never, "!echo ok");

    expect(shell.execute).toHaveBeenCalledWith({ command: "echo ok", cwd: undefined });
    expect(result).toEqual({ type: "shell", content: "ok" });
  });

  it("routes normal prompts with references", async () => {
    const refs = [{
      token: "@a.ts",
      path: "/repo/a.ts",
      displayPath: "a.ts",
      content: "const a = 1;",
    }];
    const router = createInputRouter({
      commandRegistry: { execute: vi.fn() },
      shellService: { execute: vi.fn() },
      referenceService: { resolveReferences: vi.fn(async () => refs) },
    });

    const result = await router.route({} as never, "Explain @a.ts");

    expect(result).toEqual({
      type: "prompt",
      content: [
        "Explain @a.ts",
        "",
        "[Referenced files]",
        "File: a.ts",
        "```",
        "const a = 1;",
        "```",
      ].join("\n"),
    });
  });
});
```

- [ ] **Step 2: Run input router tests and verify failure**

Run:

```bash
npx vitest run src/cli/runtime/input-router.test.ts
```

Expected: fail because `input-router.ts` does not exist.

- [ ] **Step 3: Implement input router**

Create `src/cli/runtime/input-router.ts`:

```ts
import type { CommandRegistry } from "./command-registry.js";
import type { ReferenceService, ResolvedReference } from "./reference-service.js";
import type { ShellService } from "./shell-service.js";
import type { CLICommandContext } from "./types.js";

export type RoutedInputResult =
  | { type: "command" }
  | { type: "shell"; content: string }
  | { type: "prompt"; content: string };

export interface InputRouterDeps {
  commandRegistry: Pick<CommandRegistry, "execute">;
  shellService: Pick<ShellService, "execute">;
  referenceService: Pick<ReferenceService, "resolveReferences">;
  cwd?: string;
}

export interface InputRouter {
  route(ctx: CLICommandContext, input: string): Promise<RoutedInputResult>;
}

function renderReferences(references: ResolvedReference[]): string {
  if (references.length === 0) {
    return "";
  }
  const blocks = references.flatMap((ref) => [
    `File: ${ref.displayPath}${ref.startLine !== undefined ? `:${ref.startLine}${ref.endLine !== ref.startLine ? `-${ref.endLine}` : ""}` : ""}`,
    "```",
    ref.content,
    "```",
  ]);
  return ["", "[Referenced files]", ...blocks].join("\n");
}

export function createInputRouter(deps: InputRouterDeps): InputRouter {
  return {
    route: async (ctx, input): Promise<RoutedInputResult> => {
      const trimmed = input.trim();
      if (trimmed.startsWith("/")) {
        await deps.commandRegistry.execute(ctx, trimmed);
        return { type: "command" };
      }
      if (trimmed.startsWith("!")) {
        const result = await deps.shellService.execute({
          command: trimmed.slice(1).trim(),
          cwd: deps.cwd,
        });
        const content = [result.stdout, result.stderr]
          .filter((part) => part.trim().length > 0)
          .join("\n");
        return { type: "shell", content: content || "[No output]" };
      }
      const references = await deps.referenceService.resolveReferences(input);
      return {
        type: "prompt",
        content: `${input}${renderReferences(references)}`,
      };
    },
  };
}
```

- [ ] **Step 4: Run input router tests**

Run:

```bash
npx vitest run src/cli/runtime/input-router.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 7**

Run:

```bash
git add src/cli/runtime/input-router.ts src/cli/runtime/input-router.test.ts
git commit -m "feat(cli): add input router"
```

---

## Task 8: Implement Workspace Helpers And CLI Toolkit

**Files:**
- Create: `src/cli/tools/workspace.ts`
- Create: `src/cli/tools/workspace.test.ts`
- Create: `src/cli/tools/cli-toolkit.ts`
- Create: `src/cli/tools/cli-toolkit.test.ts`

- [ ] **Step 1: Write workspace helper tests**

Create `src/cli/tools/workspace.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveWorkspacePath } from "./workspace.js";

describe("resolveWorkspacePath", () => {
  it("resolves relative paths inside the workspace", () => {
    const resolved = resolveWorkspacePath("C:/repo", "src/index.ts");
    expect(resolved.displayPath).toBe("src/index.ts");
  });

  it("rejects paths escaping the workspace by default", () => {
    expect(() => resolveWorkspacePath("C:/repo", "../outside.txt")).toThrow(
      "Path escapes workspace",
    );
  });
});
```

- [ ] **Step 2: Write CLI toolkit tests**

Create `src/cli/tools/cli-toolkit.test.ts`:

```ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createCLIToolkit } from "./cli-toolkit.js";
import { createPermissionService } from "../runtime/permission-service.js";

describe("createCLIToolkit", () => {
  it("provides workspace-aware read and edit tools", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-tools-"));
    await writeFile(join(baseDir, "a.txt"), "hello", "utf-8");
    const toolkit = createCLIToolkit({
      baseDir,
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => false,
      requestApproval: vi.fn(),
      shellService: { execute: vi.fn() },
    });

    const names = toolkit.tools.map((tool) => tool.name);
    expect(names).toContain("read");
    expect(names).toContain("edit");

    const read = toolkit.tools.find((tool) => tool.name === "read")!;
    expect(await read.execute({ path: "a.txt" })).toBe("hello");
  });
});
```

- [ ] **Step 3: Run toolkit tests and verify failure**

Run:

```bash
npx vitest run src/cli/tools/workspace.test.ts src/cli/tools/cli-toolkit.test.ts
```

Expected: fail because the files do not exist.

- [ ] **Step 4: Implement workspace helpers**

Create `src/cli/tools/workspace.ts`:

```ts
import { isAbsolute, relative, resolve } from "node:path";

export interface WorkspacePath {
  absolutePath: string;
  displayPath: string;
}

export function resolveWorkspacePath(
  baseDir: string,
  inputPath: string,
  options: { allowOutside?: boolean } = {},
): WorkspacePath {
  const root = resolve(baseDir);
  const target = resolve(root, inputPath);
  const rel = relative(root, target);
  if (options.allowOutside !== true && (rel.startsWith("..") || isAbsolute(rel))) {
    throw new Error(`Path escapes workspace: ${inputPath}`);
  }
  return {
    absolutePath: target,
    displayPath: rel === "" ? "." : rel.replaceAll("\\", "/"),
  };
}
```

- [ ] **Step 5: Implement CLI toolkit**

Create `src/cli/tools/cli-toolkit.ts`:

```ts
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { Tool } from "../../tool/types.js";
import type { PermissionService } from "../runtime/permission-service.js";
import type { ShellService } from "../runtime/shell-service.js";
import { resolveWorkspacePath } from "./workspace.js";

const PathParamsSchema = z.object({
  path: z.string().min(1),
});

const ReadParamsSchema = PathParamsSchema.extend({
  offset: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
});

const WriteParamsSchema = PathParamsSchema.extend({
  content: z.string(),
});

const EditParamsSchema = PathParamsSchema.extend({
  oldString: z.string(),
  newString: z.string(),
  replaceAll: z.boolean().optional(),
});

const ShellParamsSchema = z.object({
  command: z.string().min(1),
  timeoutMs: z.number().int().positive().optional(),
});

export interface CLIToolkitOptions {
  baseDir: string;
  permissionService: PermissionService;
  getAutoApprove: () => boolean;
  requestApproval: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
  shellService: ShellService;
}

export interface CLIToolkit {
  tools: Tool[];
}

async function assertPermission(
  options: CLIToolkitOptions,
  toolName: string,
  args: Record<string, unknown>,
): Promise<void> {
  const result = options.permissionService.resolve({ toolName, args }, options.getAutoApprove());
  if (result.decision === "deny") {
    throw new Error(`Permission denied for ${toolName}: ${result.reason}`);
  }
  if (result.decision === "ask" && !(await options.requestApproval(toolName, args))) {
    throw new Error(`Permission rejected for ${toolName}`);
  }
}

function createReadTool(options: CLIToolkitOptions): Tool {
  return {
    name: "read",
    description: "Read a workspace file or directory with optional line range.",
    parameters: ReadParamsSchema,
    execute: async (args): Promise<string> => {
      await assertPermission(options, "read", args);
      const parsed = ReadParamsSchema.parse(args);
      const target = resolveWorkspacePath(options.baseDir, parsed.path);
      const info = await stat(target.absolutePath);
      if (info.isDirectory()) {
        return (await readdir(target.absolutePath)).join("\n");
      }
      const content = await readFile(target.absolutePath, "utf-8");
      if (parsed.offset === undefined && parsed.limit === undefined) {
        return content;
      }
      const lines = content.split("\n");
      const start = (parsed.offset ?? 1) - 1;
      const end = parsed.limit === undefined ? lines.length : start + parsed.limit;
      return lines.slice(start, end).join("\n");
    },
  };
}

function createWriteTool(options: CLIToolkitOptions): Tool {
  return {
    name: "write",
    description: "Write a workspace file, creating parent directories.",
    parameters: WriteParamsSchema,
    execute: async (args): Promise<string> => {
      await assertPermission(options, "write", args);
      const parsed = WriteParamsSchema.parse(args);
      const target = resolveWorkspacePath(options.baseDir, parsed.path);
      await mkdir(dirname(target.absolutePath), { recursive: true });
      await writeFile(target.absolutePath, parsed.content, "utf-8");
      return `Wrote ${target.displayPath}`;
    },
  };
}

function createEditTool(options: CLIToolkitOptions): Tool {
  return {
    name: "edit",
    description: "Edit a workspace file by exact string replacement.",
    parameters: EditParamsSchema,
    execute: async (args): Promise<string> => {
      await assertPermission(options, "edit", args);
      const parsed = EditParamsSchema.parse(args);
      const target = resolveWorkspacePath(options.baseDir, parsed.path);
      const content = await readFile(target.absolutePath, "utf-8");
      const count = content.split(parsed.oldString).length - 1;
      if (count === 0) {
        throw new Error(`oldString not found in ${target.displayPath}`);
      }
      if (count > 1 && parsed.replaceAll !== true) {
        throw new Error(`oldString found ${count} times in ${target.displayPath}`);
      }
      const next = parsed.replaceAll === true
        ? content.replaceAll(parsed.oldString, parsed.newString)
        : content.replace(parsed.oldString, parsed.newString);
      await writeFile(target.absolutePath, next, "utf-8");
      return `Edited ${target.displayPath}`;
    },
  };
}

function createShellTool(options: CLIToolkitOptions): Tool {
  return {
    name: "shell",
    description: "Execute a shell command in the workspace.",
    parameters: ShellParamsSchema,
    execute: async (args, signal): Promise<string> => {
      await assertPermission(options, "shell", args);
      const parsed = ShellParamsSchema.parse(args);
      const result = await options.shellService.execute({
        command: parsed.command,
        cwd: options.baseDir,
        signal,
        ...(parsed.timeoutMs !== undefined && { timeoutMs: parsed.timeoutMs }),
      });
      const output = [result.stdout, result.stderr]
        .filter((part) => part.trim().length > 0)
        .join("\n");
      const suffix = result.timedOut
        ? "\n[Timed out]"
        : result.aborted
          ? "\n[Aborted]"
          : result.exitCode !== 0
            ? `\n[Exit code: ${result.exitCode}]`
            : "";
      return `${output || "[No output]"}${suffix}`;
    },
  };
}

export function createCLIToolkit(options: CLIToolkitOptions): CLIToolkit {
  return {
    tools: [
      createReadTool(options),
      createWriteTool(options),
      createEditTool(options),
      createShellTool(options),
    ],
  };
}
```

- [ ] **Step 6: Run toolkit tests**

Run:

```bash
npx vitest run src/cli/tools/workspace.test.ts src/cli/tools/cli-toolkit.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit Task 8**

Run:

```bash
git add src/cli/tools
git commit -m "feat(cli): add workspace tool toolkit"
```

---

## Task 9: Add Built-In Commands

**Files:**
- Create: `src/cli/commands/builtin.ts`
- Create: `src/cli/commands/builtin.test.ts`

- [ ] **Step 1: Write built-in command tests**

Create `src/cli/commands/builtin.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createCommandRegistry } from "../runtime/command-registry.js";
import { registerBuiltinCommands } from "./builtin.js";
import type { CLICommandContext, CLIState } from "../runtime/types.js";

function state(): CLIState {
  return {
    baseDir: process.cwd(),
    config: {} as CLIState["config"],
    mode: "build",
    modelName: "openai/fast",
    modelPaths: ["openai/fast"],
    sessionId: "s1",
    sessionName: "default",
    autoApprove: false,
    showReasoning: false,
    showToolDetails: false,
    isRunning: false,
    currentTool: null,
    messages: [],
    streamingText: "",
    reasoningText: "",
    turnCount: 0,
    tokenUsage: { input: 0, output: 0, total: 0 },
    panel: { type: "none" },
    approval: null,
    error: null,
  };
}

function ctx(): CLICommandContext {
  let current = state();
  return {
    runtime: {} as CLICommandContext["runtime"],
    agent: {
      getMessages: vi.fn(async () => []),
      previewContext: vi.fn(async () => []),
      getToolList: vi.fn(async () => []),
    } as unknown as CLICommandContext["agent"],
    getState: () => current,
    updateState: (patch) => { current = { ...current, ...patch }; },
    notice: vi.fn(),
  };
}

describe("registerBuiltinCommands", () => {
  it("registers Phase 1 commands", () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);

    expect(registry.list().map((command) => command.name)).toEqual(expect.arrayContaining([
      "help",
      "context",
      "history",
      "tools",
      "agent",
      "auto",
      "details",
      "thinking",
      "quit",
    ]));
  });

  it("opens help panel", async () => {
    const registry = createCommandRegistry();
    registerBuiltinCommands(registry);
    const commandCtx = ctx();

    await registry.execute(commandCtx, "/help");

    expect(commandCtx.getState().panel).toEqual({ type: "help" });
  });
});
```

- [ ] **Step 2: Run built-in command tests and verify failure**

Run:

```bash
npx vitest run src/cli/commands/builtin.test.ts
```

Expected: fail because `builtin.ts` does not exist.

- [ ] **Step 3: Implement built-in commands**

Create `src/cli/commands/builtin.ts`:

```ts
import type { CommandRegistry } from "../runtime/command-registry.js";

export function registerBuiltinCommands(registry: CommandRegistry): void {
  registry.register({
    name: "help",
    aliases: ["h"],
    description: "Show help",
    usage: "/help",
    execute: async (ctx) => {
      ctx.updateState({ panel: { type: "help" } });
    },
  });
  registry.register({
    name: "history",
    description: "Show message history",
    usage: "/history",
    execute: async (ctx) => {
      ctx.updateState({ panel: { type: "history", messages: await ctx.agent.getMessages() } });
    },
  });
  registry.register({
    name: "context",
    description: "Preview context",
    usage: "/context",
    execute: async (ctx) => {
      ctx.updateState({ panel: { type: "context", messages: await ctx.agent.previewContext() } });
    },
  });
  registry.register({
    name: "tools",
    description: "List tools",
    usage: "/tools",
    execute: async (ctx) => {
      ctx.updateState({ panel: { type: "tools", tools: await ctx.agent.getToolList() } });
    },
  });
  registry.register({
    name: "agent",
    description: "Switch agent mode",
    usage: "/agent build|plan",
    execute: async (ctx, args) => {
      const mode = args.trim();
      if (mode !== "build" && mode !== "plan") {
        ctx.notice("info", `Current agent: ${ctx.getState().mode}`);
        return;
      }
      ctx.updateState({ mode });
      await ctx.runtime.rebuildAgent(`switch agent ${mode}`);
    },
  });
  registry.register({
    name: "auto",
    description: "Toggle auto approval",
    usage: "/auto",
    execute: async (ctx) => {
      ctx.updateState({ autoApprove: !ctx.getState().autoApprove });
    },
  });
  registry.register({
    name: "details",
    description: "Toggle tool details",
    usage: "/details",
    execute: async (ctx) => {
      ctx.updateState({ showToolDetails: !ctx.getState().showToolDetails });
    },
  });
  registry.register({
    name: "thinking",
    description: "Toggle reasoning visibility",
    usage: "/thinking",
    execute: async (ctx) => {
      ctx.updateState({ showReasoning: !ctx.getState().showReasoning });
    },
  });
  registry.register({
    name: "quit",
    aliases: ["exit", "q"],
    description: "Exit",
    usage: "/quit",
    execute: async (ctx) => {
      await ctx.runtime.destroy();
      process.exit(0);
    },
  });
}
```

- [ ] **Step 4: Run built-in command tests**

Run:

```bash
npx vitest run src/cli/commands/builtin.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 9**

Run:

```bash
git add src/cli/commands
git commit -m "feat(cli): add built in command registry"
```

---

## Task 10: Move Agent Construction Behind Runtime Agent Factory

**Files:**
- Create: `src/cli/runtime/agent-factory.ts`
- Create: `src/cli/runtime/agent-factory.test.ts`
- Modify: `src/cli/cli-app.ts`
- Modify: `src/cli/cli-app.test.ts`

- [ ] **Step 1: Write agent factory tests**

Create `src/cli/runtime/agent-factory.test.ts` with tests adapted from `src/cli/cli-app.test.ts`:

```ts
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ThinkingLevel } from "../../core/config.js";
import { createCLIAgentFactory, formatResolvedModelPath } from "./agent-factory.js";
import { createPermissionService } from "./permission-service.js";
import { createShellService } from "./shell-service.js";

async function writeConfig(baseDir: string): Promise<void> {
  const configDir = join(baseDir, ".cliagent");
  await mkdir(configDir, { recursive: true });
  await writeFile(join(configDir, "config.json"), JSON.stringify({
    providers: [{
      engine: "openai",
      key: "sk-test",
      models: [{
        id: "fast",
        name: "gpt-4o-mini",
        thinkingLevels: [ThinkingLevel.None],
      }],
    }],
    defaultModel: "fast",
  }), "utf-8");
}

describe("createCLIAgentFactory", () => {
  it("builds a build-mode agent with resolved models", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-agent-factory-"));
    await writeConfig(baseDir);
    const factory = await createCLIAgentFactory({
      baseDir,
      mode: "build",
      permissionService: createPermissionService({ "*": "allow" }),
      getAutoApprove: () => false,
      requestApproval: vi.fn(),
      shellService: createShellService({ windows: "powershell", timeoutMs: 120000 }),
    });

    const built = await factory.build("session-1");

    expect(built.agent.getModels().map(formatResolvedModelPath)).toEqual(["openai/fast"]);
    expect(built.agent.getCurrentResolvedModel()).toMatchObject({ id: "fast", provider: "openai" });
    expect(built.compressor.getCompressedCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run agent factory tests and verify failure**

Run:

```bash
npx vitest run src/cli/runtime/agent-factory.test.ts
```

Expected: fail because `agent-factory.ts` does not exist.

- [ ] **Step 3: Implement agent factory by moving logic from `cli-app.ts`**

Create `src/cli/runtime/agent-factory.ts`. Move these existing exports from
`src/cli/cli-app.ts` into the new file:

- `formatResolvedModelPath`
- `getResolvedModelPaths`
- `selectResolvedModelForCLI`
- `buildSubagentAgentConfig`

Then create:

```ts
export interface CLIAgentFactoryOptions {
  baseDir: string;
  mode: CLIAgentMode;
  permissionService: PermissionService;
  getAutoApprove: () => boolean;
  requestApproval: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
  shellService: ShellService;
}

export interface BuiltRuntimeAgent {
  agent: MiniAgent;
  config: CLIConfig;
  compressor: CLICompressor;
}

export interface CLIAgentFactory {
  build(sessionId: string): Promise<BuiltRuntimeAgent>;
}
```

Reuse the existing `buildAgentInner()`, `createConfiguredSubagentFactory()`,
`createBuiltinBlueprintManager()`, `createCLIBlueprint()`, and
`buildSystemPrompt()` logic from `cli-app.ts`, but change the blueprint so:

```ts
blueprint.approval = { use: "static-auto-approve" };
```

is replaced by registering CLI-local tools and a CLI approval module through
`extraUses` passed to `manager.assemble()`. The `extraUses` should include:

```ts
...createCLIToolkit({
  baseDir,
  permissionService: options.permissionService,
  getAutoApprove: options.getAutoApprove,
  requestApproval: options.requestApproval,
  shellService: options.shellService,
}).tools
```

The existing built-in tools can remain in the default blueprint for this task;
the CLI-local tools with the same names override them because `MiniAgent`
stores tools in a map by name.

- [ ] **Step 4: Keep compatibility exports in `cli-app.ts`**

In `src/cli/cli-app.ts`, import the moved helpers from `./runtime/agent-factory.js` and re-export them:

```ts
export {
  buildSubagentAgentConfig,
  formatResolvedModelPath,
  getResolvedModelPaths,
  selectResolvedModelForCLI,
} from "./runtime/agent-factory.js";
```

Leave `createCLIApp()` in place until Task 11 replaces it.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run src/cli/runtime/agent-factory.test.ts src/cli/cli-app.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit Task 10**

Run:

```bash
git add src/cli/runtime/agent-factory.ts src/cli/runtime/agent-factory.test.ts src/cli/cli-app.ts src/cli/cli-app.test.ts
git commit -m "refactor(cli): move agent construction to runtime factory"
```

---

## Task 11: Implement Runtime Facade

**Files:**
- Create: `src/cli/runtime/app.ts`
- Create: `src/cli/runtime/app.test.ts`

- [ ] **Step 1: Write runtime app tests**

Create `src/cli/runtime/app.test.ts`:

```ts
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ThinkingLevel } from "../../core/config.js";
import { createCLIRuntime } from "./app.js";

async function writeConfig(baseDir: string): Promise<void> {
  await mkdir(join(baseDir, ".cliagent"), { recursive: true });
  await writeFile(join(baseDir, ".cliagent", "config.json"), JSON.stringify({
    providers: [{
      engine: "openai",
      key: "sk-test",
      models: [{ id: "fast", name: "gpt-4o-mini", thinkingLevels: [ThinkingLevel.None] }],
    }],
    defaultModel: "fast",
  }), "utf-8");
}

describe("createCLIRuntime", () => {
  it("creates initial state and handles command input", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "miniagent-runtime-"));
    await writeConfig(baseDir);

    const runtime = await createCLIRuntime(baseDir);
    await runtime.submitInput("/help");

    expect(runtime.getState().panel).toEqual({ type: "help" });
    await runtime.destroy();
  });
});
```

- [ ] **Step 2: Run runtime app tests and verify failure**

Run:

```bash
npx vitest run src/cli/runtime/app.test.ts
```

Expected: fail because `app.ts` does not exist.

- [ ] **Step 3: Implement runtime facade**

Create `src/cli/runtime/app.ts`:

```ts
import { join } from "node:path";
import { MessageType, type Message } from "../../core/types.js";
import { CLIAGENT_DIR, loadConfig } from "../config.js";
import { registerBuiltinCommands } from "../commands/builtin.js";
import { createCommandRegistry } from "./command-registry.js";
import { createCLIAgentFactory, formatResolvedModelPath, getResolvedModelPaths, selectResolvedModelForCLI } from "./agent-factory.js";
import { createInputRouter } from "./input-router.js";
import { createPermissionService } from "./permission-service.js";
import { createReferenceService } from "./reference-service.js";
import { SessionManager } from "../../core/session.js";
import { createShellService } from "./shell-service.js";
import type { CLIAppRuntime, CLIEvent, CLIRuntimeSubscriber, CLIState } from "./types.js";

export async function createCLIRuntime(baseDir: string): Promise<CLIAppRuntime> {
  const config = await loadConfig(baseDir);
  const sessionManager = new SessionManager(join(baseDir, CLIAGENT_DIR));
  await sessionManager.load();
  const existingSessions = sessionManager.list();
  const session = existingSessions[0] ?? await sessionManager.create("default");
  sessionManager.setActive(session.id);

  const subscribers = new Set<CLIRuntimeSubscriber>();
  let approvalResolvers = new Map<string, (decision: boolean) => void>();
  const permissionService = createPermissionService(config.permission);
  const shellService = createShellService(config.shell);
  const factory = await createCLIAgentFactory({
    baseDir,
    mode: config.defaultAgent,
    permissionService,
    getAutoApprove: () => state.autoApprove,
    requestApproval: (toolName, args) => new Promise((resolve) => {
      const id = crypto.randomUUID();
      approvalResolvers.set(id, resolve);
      updateState({ approval: { id, toolName, args, decision: "pending" } });
    }),
    shellService,
  });
  let built = await factory.build(session.id);
  let state: CLIState = {
    baseDir,
    config,
    mode: config.defaultAgent,
    modelName: (() => {
      const current = built.agent.getCurrentResolvedModel();
      return current ? formatResolvedModelPath(current) : "(none)";
    })(),
    modelPaths: getResolvedModelPaths(built.agent),
    sessionId: session.id,
    sessionName: session.name,
    autoApprove: false,
    showReasoning: config.tui.showReasoning,
    showToolDetails: config.tui.showToolDetails,
    isRunning: false,
    currentTool: null,
    messages: await built.agent.getMessages(),
    streamingText: "",
    reasoningText: "",
    turnCount: 0,
    tokenUsage: { input: 0, output: 0, total: 0 },
    panel: { type: "none" },
    approval: null,
    error: null,
  };
  const registry = createCommandRegistry();
  registerBuiltinCommands(registry);
  const router = createInputRouter({
    commandRegistry: registry,
    shellService,
    referenceService: createReferenceService(baseDir),
    cwd: baseDir,
  });

  function emit(event: CLIEvent): void {
    for (const subscriber of subscribers) {
      subscriber(event);
    }
  }

  function updateState(patch: Partial<CLIState>): void {
    state = { ...state, ...patch };
    emit({ type: "state", state });
  }

  function bindAgentEvents(): void {
    built.agent.on("run:start", () => updateState({ isRunning: true, error: null }));
    built.agent.on("run:complete", (payload) => updateState({
      isRunning: false,
      messages: payload.messages,
      streamingText: "",
      reasoningText: "",
    }));
    built.agent.on("run:error", (payload) => updateState({
      isRunning: false,
      error: payload.error instanceof Error ? payload.error.message : String(payload.error),
    }));
    built.agent.on("turn:start", (payload) => updateState({ turnCount: payload.turn }));
    built.agent.on("llm:chunk", (payload) => {
      if (payload.chunk.type === "text-delta") {
        updateState({ streamingText: state.streamingText + payload.chunk.text });
      }
      if (payload.chunk.type === "reasoning-delta") {
        updateState({ reasoningText: state.reasoningText + payload.chunk.text });
      }
    });
    built.agent.on("llm:response", (payload) => updateState({ tokenUsage: payload.response.tokenCount }));
    built.agent.on("tool:execute", (payload) => updateState({ currentTool: payload.toolCall.toolName }));
    built.agent.on("tool:result", () => updateState({ currentTool: null }));
    built.agent.on("message:notify", (payload) => updateState({ messages: [...state.messages, payload.message] }));
  }

  bindAgentEvents();

  const runtime: CLIAppRuntime = {
    getState: () => state,
    subscribe: (listener) => {
      subscribers.add(listener);
      return () => { subscribers.delete(listener); };
    },
    submitInput: async (input) => {
      const result = await router.route({
        runtime,
        agent: built.agent,
        getState: () => state,
        updateState,
        notice: (level, message) => emit({ type: "notice", level, message }),
      }, input);
      if (result.type === "prompt") {
        const message: Message = {
          id: crypto.randomUUID(),
          type: MessageType.User,
          content: result.content,
        };
        await built.agent.run(message);
      }
      if (result.type === "shell") {
        const message: Message = {
          id: crypto.randomUUID(),
          type: MessageType.User,
          content: `Shell output:\n${result.content}`,
        };
        updateState({ messages: [...state.messages, message] });
      }
    },
    runCommand: async (name, args) => {
      await registry.execute({
        runtime,
        agent: built.agent,
        getState: () => state,
        updateState,
        notice: (level, message) => emit({ type: "notice", level, message }),
      }, `/${name} ${args}`.trim());
    },
    selectModel: async (path) => {
      selectResolvedModelForCLI(built.agent, path);
      const current = built.agent.getCurrentResolvedModel();
      updateState({ modelName: current ? formatResolvedModelPath(current) : "(none)" });
    },
    answerApproval: (id, decision) => {
      approvalResolvers.get(id)?.(decision);
      approvalResolvers.delete(id);
      updateState({ approval: null });
    },
    stop: () => { built.agent.stop(); },
    rebuildAgent: async () => {
      const previous = built.agent;
      built = await factory.build(state.sessionId);
      await previous.destroy();
      bindAgentEvents();
      updateState({
        modelPaths: getResolvedModelPaths(built.agent),
        messages: await built.agent.getMessages(),
      });
    },
    destroy: async () => {
      approvalResolvers = new Map();
      await built.agent.destroy();
    },
  };

  return runtime;
}
```

- [ ] **Step 4: Run runtime app tests**

Run:

```bash
npx vitest run src/cli/runtime/app.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 11**

Run:

```bash
git add src/cli/runtime/app.ts src/cli/runtime/app.test.ts
git commit -m "feat(cli): add runtime facade"
```

---

## Task 12: Wire TUI To Runtime

**Files:**
- Create: `src/cli/hooks/useRuntime.ts`
- Create: `src/cli/hooks/useRuntime.test.ts`
- Modify: `src/cli/components/App.tsx`
- Modify: `src/cli/components/App.test.tsx`
- Modify: `src/cli/index.tsx`
- Modify: `src/cli/integration.test.tsx`

- [ ] **Step 1: Write runtime hook tests**

Create `src/cli/hooks/useRuntime.test.ts`:

```ts
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRuntime } from "./useRuntime.js";
import type { CLIAppRuntime, CLIState } from "../runtime/types.js";

function state(): CLIState {
  return {
    baseDir: process.cwd(),
    config: {} as CLIState["config"],
    mode: "build",
    modelName: "openai/fast",
    modelPaths: ["openai/fast"],
    sessionId: "s1",
    sessionName: "default",
    autoApprove: false,
    showReasoning: false,
    showToolDetails: false,
    isRunning: false,
    currentTool: null,
    messages: [],
    streamingText: "",
    reasoningText: "",
    turnCount: 0,
    tokenUsage: { input: 0, output: 0, total: 0 },
    panel: { type: "none" },
    approval: null,
    error: null,
  };
}

describe("useRuntime", () => {
  it("subscribes to runtime state", () => {
    let listener: ((event: { type: "state"; state: CLIState }) => void) | undefined;
    const runtime: CLIAppRuntime = {
      getState: vi.fn(state),
      subscribe: vi.fn((next) => {
        listener = next as typeof listener;
        return () => undefined;
      }),
      submitInput: vi.fn(),
      runCommand: vi.fn(),
      selectModel: vi.fn(),
      answerApproval: vi.fn(),
      stop: vi.fn(),
      rebuildAgent: vi.fn(),
      destroy: vi.fn(),
    };

    const { result } = renderHook(() => useRuntime(runtime));
    expect(result.current.state.modelName).toBe("openai/fast");

    act(() => {
      listener?.({ type: "state", state: { ...state(), modelName: "openai/slow" } });
    });

    expect(result.current.state.modelName).toBe("openai/slow");
  });
});
```

- [ ] **Step 2: Implement runtime hook**

Create `src/cli/hooks/useRuntime.ts`:

```ts
import { useEffect, useState } from "react";
import type { CLIAppRuntime, CLIState } from "../runtime/types.js";

export function useRuntime(runtime: CLIAppRuntime): { state: CLIState } {
  const [state, setState] = useState(runtime.getState());

  useEffect(() => runtime.subscribe((event) => {
    if (event.type === "state") {
      setState(event.state);
    }
  }), [runtime]);

  return { state };
}
```

- [ ] **Step 3: Update `App` props and tests**

Change `src/cli/components/App.tsx` so `AppProps` accepts:

```ts
import type { CLIAppRuntime } from "../runtime/types.js";

export interface AppProps {
  runtime: CLIAppRuntime;
}
```

Inside `App`, call `const { state } = useRuntime(runtime);`.

Replace uses of old props:

- `modelName` becomes `state.modelName`.
- `modelPaths` becomes `state.modelPaths`.
- `sessionName` becomes `state.sessionName`.
- `state.sendMessage(text)` becomes `runtime.submitInput(text)`.
- `agent.getMessages()` becomes `state.messages` or `runtime.runCommand("history", "")`.
- `agent.previewContext()` becomes `runtime.runCommand("context", "")`.
- `onSelectModel` becomes `runtime.selectModel`.

For this task, keep `PanelView` and `ModelSelectView` working by mapping
`state.panel` to the existing panels:

```tsx
if (state.panel.type === "history" || state.panel.type === "context") {
  return <PanelView data={{ title: state.panel.type, messages: state.panel.messages }} onClose={() => void runtime.runCommand("panel-close", "")} />;
}
```

If `panel-close` is not registered yet, add a hidden command in `builtin.ts`:

```ts
registry.register({
  name: "panel-close",
  hidden: true,
  description: "Close panel",
  usage: "/panel-close",
  execute: async (ctx) => {
    ctx.updateState({ panel: { type: "none" } });
  },
});
```

Update `src/cli/components/App.test.tsx` and `src/cli/integration.test.tsx`
mock props to pass a fake `runtime` object with `getState()` and `subscribe()`.

- [ ] **Step 4: Update `index.tsx`**

In `src/cli/index.tsx`, replace `createCLIApp()` and the local command switch
with:

```tsx
const runtime = await createCLIRuntime(process.cwd());
inkHolder.current = render(<App runtime={runtime} />, { exitOnCtrlC: false });
```

Keep alternate-screen setup and fatal-error handling.

- [ ] **Step 5: Run TUI tests**

Run:

```bash
npx vitest run src/cli/hooks/useRuntime.test.ts src/cli/components/App.test.tsx src/cli/integration.test.tsx
```

Expected: pass after tests use runtime mocks.

- [ ] **Step 6: Commit Task 12**

Run:

```bash
git add src/cli/hooks/useRuntime.ts src/cli/hooks/useRuntime.test.ts src/cli/components/App.tsx src/cli/components/App.test.tsx src/cli/index.tsx src/cli/integration.test.tsx src/cli/commands/builtin.ts
git commit -m "refactor(cli): wire tui to runtime"
```

---

## Task 13: Update CLI Documentation For Phase 1

**Files:**
- Modify: `document/cli/repl.md`
- Modify: `document/cli/repl_CN.md`
- Modify: `README.md`
- Modify: `README_CN.md`

- [ ] **Step 1: Update English CLI docs**

In `document/cli/repl.md`, update the command table to include:

```md
| `/agent [build|plan]` | Show or switch the primary agent mode |
| `/auto` | Toggle auto approval for requests that are not denied |
| `/details` | Toggle expanded tool details |
| `/thinking` | Toggle reasoning visibility |
```

Replace the HITL section with:

```md
## Permissions

The CLI uses a product-level permission policy. Read/search tools are allowed by
default, mutating tools and shell commands ask by default, and explicit deny
rules are always enforced. `/auto` allows requests that would otherwise ask, but
it never overrides a deny rule.
```

Add a short shell note:

```md
## Shell

Messages beginning with `!` run through the CLI shell service and are recorded
as shell output in the conversation. On Windows the default shell is PowerShell;
the config can switch to Git Bash, WSL, cmd, or an explicit executable.
```

- [ ] **Step 2: Update Chinese CLI docs**

Apply equivalent updates to `document/cli/repl_CN.md` in Chinese. Preserve the
existing table style and avoid broad reformatting.

- [ ] **Step 3: Update README CLI command tables**

Mirror the new command rows and permissions wording in `README.md` and
`README_CN.md`.

- [ ] **Step 4: Run doc search**

Run:

```bash
rg -n "allow-all|HITL state|not blocked|bash -c|/hitl" README.md README_CN.md document/cli
```

Expected: no stale statement claiming the CLI approval path is still `allow-all`.

- [ ] **Step 5: Commit Task 13**

Run:

```bash
git add README.md README_CN.md document/cli/repl.md document/cli/repl_CN.md
git commit -m "docs(cli): document runtime permissions"
```

---

## Task 14: Phase 1 Verification

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

- [ ] **Step 3: Run a CLI startup smoke check**

Run:

```bash
npm run chat
```

Expected: if `.cliagent/config.json` is absent in the current project, the CLI
creates the config template and exits with the existing message. If config is
present, it starts the alternate-screen TUI without throwing before the first
render. Do not leave a TUI process running after the smoke check.

- [ ] **Step 4: Record Phase 1 remaining gaps**

If Phase 1 is green, write a short note in the final response listing remaining
planned work:

- Phase 2: undo/redo, export/import, custom command files.
- Phase 3: git tools, editor composition, diff viewer, LSP diagnostics.
- Phase 4: optional core changes only after approval.

- [ ] **Step 5: Commit any verification fixes**

If verification required fixes, commit them with a focused message:

```bash
git add <changed-files>
git commit -m "fix(cli): stabilize runtime phase one"
```

If no fixes were required, do not create an empty commit.

---

## Self-Review Notes

- Spec coverage: Phase 1 covers runtime facade, command registry, permission
  service, shell service, file references, CLI-local tools, build/plan modes,
  TUI runtime wiring, and docs. Undo/redo, export/import, and custom command
  files are intentionally left for the next plan because the spec itself
  assigns them to Phase 2.
- Type consistency: `CLIAppRuntime`, `CLIState`, `CLICommandContext`,
  `PermissionService`, `ShellService`, and `ReferenceService` are named once
  and used consistently across tasks.
- Core boundary: no task changes `src/core/**`. Any need for
  `MessageStopException`, parse-error recovery, empty-response nudge, or
  pair-safe core compression must be raised separately before implementation.
